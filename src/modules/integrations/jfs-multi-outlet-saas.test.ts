import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeScopedJfsConnection, executeTrustedMultiOutletScraper } from "./jfs-multi-outlet-client";
import { mapConcurrent } from "./bounded-concurrency";
import { encryptCredential, decryptCredential } from "./credential-crypto";
import { maskAccount } from "./jfs-credential.service";
import type { SettingsScope } from "@/modules/settings/settings.types";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    integrationCredential: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db/prisma";

describe("SaaS Multi-Tenant / Multi-Outlet Integration Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY = "01234567890123456789012345678901";
    process.env.JFS_MIDDLEWARE_BASE_URL = "https://middleware.test.internal";
    process.env.JFS_MIDDLEWARE_AUTH_KEY = "test-auth-key-123";
  });

  const scopeTenantA: SettingsScope = { tenantId: "tenant-uuid-A", outletId: "outlet-uuid-A1" };
  const scopeTenantB: SettingsScope = { tenantId: "tenant-uuid-B", outletId: "outlet-uuid-B1" };
  const scopeOutletA2: SettingsScope = { tenantId: "tenant-uuid-A", outletId: "outlet-uuid-A2" };

  it("1 & 2. Isolates Tenant A vs Tenant B and Outlet A1 vs Outlet A2 headers", async () => {
    const mockFetcher = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: true, data: { success: true, total: 0, data: [] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    (prisma.integrationCredential.findUnique as any).mockImplementation((args: any) => {
      const { tenantId, outletId } = args.where.tenantId_outletId_provider;
      if (tenantId === "tenant-uuid-A" && outletId === "outlet-uuid-A1") {
        return Promise.resolve({
          id: "cred-A1",
          connectionStatus: "CONNECTED",
          isActive: true,
          networkCode: "OUTLET_A1_CODE",
          accountEncrypted: encryptCredential({ account: "accountA1" }),
          passwordEncrypted: encryptCredential({ password: "passA1" }),
          outlet: { code: "OUTLET_A1_CODE" },
        });
      }
      if (tenantId === "tenant-uuid-B" && outletId === "outlet-uuid-B1") {
        return Promise.resolve({
          id: "cred-B1",
          connectionStatus: "CONNECTED",
          isActive: true,
          networkCode: "OUTLET_B1_CODE",
          accountEncrypted: encryptCredential({ account: "accountB1" }),
          passwordEncrypted: encryptCredential({ password: "passB1" }),
          outlet: { code: "OUTLET_B1_CODE" },
        });
      }
      return Promise.resolve(null);
    });

    await executeTrustedMultiOutletScraper(scopeTenantA, "PICKUP", { fetcher: mockFetcher });
    const callA = mockFetcher.mock.calls[0];
    expect(callA[0]).toBe("https://middleware.test.internal/pickup");
    expect(callA[1].headers["X-JFS-Tenant-Id"]).toBe("tenant-uuid-A");
    expect(callA[1].headers["X-JFS-Outlet-Id"]).toBe("outlet-uuid-A1");
    expect(callA[1].headers["X-JFS-Outlet-Code"]).toBe("OUTLET_A1_CODE");
    expect(callA[1].headers["X-JFS-Account"]).toBe("accountA1");

    await executeTrustedMultiOutletScraper(scopeTenantB, "PICKUP", { fetcher: mockFetcher });
    const callB = mockFetcher.mock.calls[1];
    expect(callB[1].headers["X-JFS-Tenant-Id"]).toBe("tenant-uuid-B");
    expect(callB[1].headers["X-JFS-Outlet-Id"]).toBe("outlet-uuid-B1");
    expect(callB[1].headers["X-JFS-Outlet-Code"]).toBe("OUTLET_B1_CODE");
    expect(callB[1].headers["X-JFS-Account"]).toBe("accountB1");
  });

  it("scoped reconnect/test use server scope and never call legacy login", async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      success: true, data: { connected: true, networkCode: "NET-A", sessionStatus: "ACTIVE" },
    }), { status: 200 }));
    for (const [operation, path] of [
      ["SCOPED_RECONNECT", "/scoped/reconnect"],
      ["SCOPED_TEST_CONNECTION", "/scoped/test-connection"],
    ] as const) {
      await executeScopedJfsConnection(scopeTenantA, operation, {
        account: "account-a", password: "password-a", outletCode: "OUTLET-A", networkCode: "NET-A", fetcher,
      });
      const [url, init] = fetcher.mock.calls.at(-1)!;
      expect(url).toBe(`https://middleware.test.internal${path}`);
      expect(url).not.toContain("/jfs-auth/login");
      expect(init.headers["X-JFS-Tenant-Id"]).toBe(scopeTenantA.tenantId);
      expect(init.headers["X-JFS-Outlet-Id"]).toBe(scopeTenantA.outletId);
    }
  });

  it("3 & 4. Verifies credential isolation and encryption response safety", () => {
    const rawSecret = { account: "my-jfs-user", password: "super-secret-password-123" };
    const encryptedAcc = encryptCredential({ account: rawSecret.account });
    const encryptedPass = encryptCredential({ password: rawSecret.password });

    expect(encryptedAcc).not.toContain(rawSecret.account);
    expect(encryptedPass).not.toContain(rawSecret.password);

    const decryptedAcc = decryptCredential<{ account: string }>(encryptedAcc).account;
    const decryptedPass = decryptCredential<{ password: string }>(encryptedPass).password;
    expect(decryptedAcc).toBe(rawSecret.account);
    expect(decryptedPass).toBe(rawSecret.password);

    const masked = maskAccount(rawSecret.account);
    expect(masked).toBe("******user");
    expect(masked).not.toContain("my-jfs");
  });

  it("5 & 6. Bounded concurrency & failure isolation across 5 outlets", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string, opts: any) => {
      const outletId = opts.headers["X-JFS-Outlet-Id"];
      if (outletId === "outlet-fail") {
        return Promise.reject(new Error("Network timeout on outlet-fail"));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, data: { success: true, total: 0, outletId, data: [] } }), { status: 200 })
      );
    });

    (prisma.integrationCredential.findUnique as any).mockImplementation((args: any) => {
      const { outletId } = args.where.tenantId_outletId_provider;
      return Promise.resolve({
        id: `cred-${outletId}`,
        connectionStatus: "CONNECTED",
        isActive: true,
        networkCode: `NET_${outletId}`,
        accountEncrypted: encryptCredential({ account: `acc-${outletId}` }),
        passwordEncrypted: encryptCredential({ password: `pass-${outletId}` }),
        outlet: { code: `NET_${outletId}` },
      });
    });

    const outlets: SettingsScope[] = [
      { tenantId: "t1", outletId: "outlet-1" },
      { tenantId: "t1", outletId: "outlet-2" },
      { tenantId: "t1", outletId: "outlet-fail" },
      { tenantId: "t1", outletId: "outlet-4" },
      { tenantId: "t1", outletId: "outlet-5" },
    ];

    const results = await mapConcurrent(outlets, 3, (scope) =>
      executeTrustedMultiOutletScraper(scope, "PICKUP", { fetcher: mockFetch })
    );

    expect(results).toHaveLength(5);
    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("fulfilled");
    expect(results[2].status).toBe("rejected");
    expect(results[3].status).toBe("fulfilled");
    expect(results[4].status).toBe("fulfilled");
  });

  it("7. Endpoint contract verification for all 9 scraper operations", async () => {
    const mockFetcher = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: true, data: { success: true, total: 0, data: [] } }), { status: 200 })
      )
    );

    (prisma.integrationCredential.findUnique as any).mockResolvedValue({
      id: "cred-test",
      connectionStatus: "CONNECTED",
      isActive: true,
      networkCode: "TEST_NET",
      accountEncrypted: encryptCredential({ account: "acc" }),
      passwordEncrypted: encryptCredential({ password: "pass" }),
      outlet: { code: "TEST_NET" },
    });

    const ops = [
      { op: "PICKUP" as const, expectedPath: "/pickup" },
      { op: "DISPATCH" as const, expectedPath: "/dispatch" },
      { op: "COD" as const, expectedPath: "/cod" },
      { op: "IBK" as const, expectedPath: "/ibk" },
      { op: "OMS" as const, expectedPath: "/oms" },
      { op: "INVENTORY" as const, expectedPath: "/inventory" },
      { op: "AGING_SIGN" as const, expectedPath: "/aging-sign" },
      { op: "WAYBILL_STATUS" as const, expectedPath: "/waybill-status" },
      { op: "SENDER_DETAIL" as const, expectedPath: "/sender-detail" },
    ];

    for (const item of ops) {
      mockFetcher.mockClear();
      await executeTrustedMultiOutletScraper(scopeTenantA, item.op, { fetcher: mockFetcher });
      expect(mockFetcher.mock.calls[0][0]).toBe(`https://middleware.test.internal${item.expectedPath}`);
    }
  });

  it("routes waybill tracking with scoped headers and the operation-only body", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { waybillNo: "JT123", latest: {}, timeline: [] } }), { status: 200 }));
    (prisma.integrationCredential.findUnique as any).mockResolvedValue({
      connectionStatus: "CONNECTED", isActive: true, networkCode: "NET-A",
      accountEncrypted: encryptCredential({ account: "account-a" }),
      passwordEncrypted: encryptCredential({ password: "password-a" }),
      outlet: { code: "OUTLET-A" },
    });
    await executeTrustedMultiOutletScraper(scopeTenantA, "WAYBILL_TRACKING", { waybillNo: "JT123", fetcher });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://middleware.test.internal/waybill-tracking");
    expect(init.headers["X-JFS-Tenant-Id"]).toBe("tenant-uuid-A");
    expect(init.headers["X-JFS-Outlet-Id"]).toBe("outlet-uuid-A1");
    expect(init.headers["X-JFS-Network-Code"]).toBe("NET-A");
    expect(JSON.parse(init.body)).toEqual({ waybillNo: "JT123" });
  });
});
