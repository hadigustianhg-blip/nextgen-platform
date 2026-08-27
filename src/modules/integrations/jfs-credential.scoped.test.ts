import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeScopedJfsConnection: vi.fn(),
  outletFindFirst: vi.fn(),
  credentialFindUnique: vi.fn(),
  credentialUpsert: vi.fn(),
  credentialUpdate: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    outlet: { findFirst: mocks.outletFindFirst },
    integrationCredential: {
      findUnique: mocks.credentialFindUnique,
      upsert: mocks.credentialUpsert,
      update: mocks.credentialUpdate,
    },
    auditLog: { create: mocks.auditCreate },
  },
}));

vi.mock("./jfs-multi-outlet-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./jfs-multi-outlet-client")>();
  return { ...actual, executeScopedJfsConnection: mocks.executeScopedJfsConnection };
});

import { decryptCredential, encryptCredential } from "./credential-crypto";
import { connectJfsIntegration, JfsIntegrationError, testJfsIntegration } from "./jfs-credential.service";
import { ScopedJfsConnectionError } from "./jfs-multi-outlet-client";

const scope = { tenantId: "tenant-production", outletId: "outlet-production" };

describe("scoped JFS credential connection flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY = "01234567890123456789012345678901";
    process.env.NEXTGEN_ENVIRONMENT = "production";
    mocks.outletFindFirst.mockResolvedValue({ id: scope.outletId, code: "SUM001A", name: "Outlet" });
    mocks.credentialFindUnique.mockResolvedValue({ networkCode: "SUM001A" });
    mocks.executeScopedJfsConnection.mockResolvedValue({
      connected: true,
      networkCode: "SUM001A",
      name: "Outlet JFS",
      sessionStatus: "ACTIVE",
    });
    mocks.credentialUpsert.mockResolvedValue({ id: "credential-id", networkCode: "SUM001A" });
    mocks.auditCreate.mockResolvedValue({ id: "audit-id" });
  });

  it("connect uses SCOPED_RECONNECT with server scope and persists encrypted CONNECTED state", async () => {
    await connectJfsIntegration(scope, { account: "ACCOUNT-1", password: "PASSWORD-1" });

    expect(mocks.executeScopedJfsConnection).toHaveBeenCalledWith(scope, "SCOPED_RECONNECT", {
      account: "ACCOUNT-1",
      password: "PASSWORD-1",
      outletCode: "SUM001A",
      networkCode: "SUM001A",
    });
    const upsert = mocks.credentialUpsert.mock.calls[0][0];
    expect(upsert.where.tenantId_outletId_provider).toEqual({
      tenantId: scope.tenantId,
      outletId: scope.outletId,
      provider: "JFS",
    });
    expect(upsert.update).toMatchObject({
      connectionStatus: "CONNECTED",
      isActive: true,
      networkCode: "SUM001A",
      lastFailureAt: null,
      lastFailureCode: null,
    });
    expect(upsert.update.accountEncrypted).not.toContain("ACCOUNT-1");
    expect(upsert.update.passwordEncrypted).not.toContain("PASSWORD-1");
    expect(decryptCredential<{ account: string }>(upsert.update.accountEncrypted).account).toBe("ACCOUNT-1");
    expect(decryptCredential<{ password: string }>(upsert.update.passwordEncrypted).password).toBe("PASSWORD-1");
  });

  it("uses an existing network mapping and rejects a mismatched reconnect result", async () => {
    mocks.credentialFindUnique.mockResolvedValue({ networkCode: "EXISTING01" });
    mocks.executeScopedJfsConnection.mockResolvedValue({
      connected: true,
      networkCode: "OTHER001",
      sessionStatus: "ACTIVE",
    });
    await expect(connectJfsIntegration(scope, { account: "ACCOUNT-1", password: "PASSWORD-1" }))
      .rejects.toMatchObject({ code: "JFS_NETWORK_MISMATCH" });
    expect(mocks.executeScopedJfsConnection.mock.calls[0][2].networkCode).toBe("EXISTING01");
    expect(mocks.credentialUpsert).not.toHaveBeenCalled();
  });

  it("test uses SCOPED_TEST_CONNECTION and clears prior failure metadata", async () => {
    mocks.credentialFindUnique.mockResolvedValue({
      id: "credential-id",
      networkCode: "SUM001A",
      connectionStatus: "CONNECTED",
      isActive: true,
      lastConnectedAt: new Date("2026-08-27T00:00:00.000Z"),
      accountEncrypted: encryptCredential({ account: "ACCOUNT-1" }),
      passwordEncrypted: encryptCredential({ password: "PASSWORD-1" }),
    });
    mocks.credentialUpdate.mockResolvedValue({ id: "credential-id" });

    await testJfsIntegration(scope);

    expect(mocks.executeScopedJfsConnection).toHaveBeenCalledWith(scope, "SCOPED_TEST_CONNECTION", {
      account: "ACCOUNT-1",
      password: "PASSWORD-1",
      outletCode: "SUM001A",
      networkCode: "SUM001A",
    });
    expect(mocks.credentialUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "credential-id" },
      data: expect.objectContaining({
        connectionStatus: "CONNECTED",
        networkCode: "SUM001A",
        lastFailureAt: null,
        lastFailureCode: null,
      }),
    }));
  });

  it("does not mislabel middleware failures as an invalid password", async () => {
    mocks.executeScopedJfsConnection.mockRejectedValue(
      new ScopedJfsConnectionError("internal failure", 500, "JFS_SCOPED_RECONNECT_FAILED"),
    );
    let error: JfsIntegrationError | null = null;
    try {
      await connectJfsIntegration(scope, { account: "ACCOUNT-1", password: "PASSWORD-1" });
    } catch (value) {
      error = value as JfsIntegrationError;
    }
    expect(error).not.toBeNull();
    if (!error) throw new Error("Expected scoped connection failure");
    expect(error.message).toBe("Gagal melakukan autentikasi JFS via middleware.");
    expect(error.message).not.toContain("password JFS tidak valid");
    expect(error.code).toBe("JFS_SCOPED_RECONNECT_FAILED");
  });

  it("uses the invalid credential message only for an explicit credential rejection", async () => {
    mocks.executeScopedJfsConnection.mockRejectedValue(
      new ScopedJfsConnectionError("rejected", 401, "JFS_LOGIN_FAILED"),
    );
    await expect(connectJfsIntegration(scope, { account: "ACCOUNT-1", password: "PASSWORD-1" }))
      .rejects.toMatchObject({
        message: "Account atau password JFS tidak valid.",
        code: "JFS_LOGIN_FAILED",
      });
  });
});
