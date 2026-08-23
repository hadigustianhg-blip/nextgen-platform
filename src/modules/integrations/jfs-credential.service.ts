import { prisma } from "@/lib/db/prisma";
import type { SettingsScope } from "@/modules/settings/settings.types";
import { decryptCredential, encryptCredential } from "./credential-crypto";
import { isJfsNetworkAllowed } from "./jfs-network-mapping";
import { executeScopedJfsConnection } from "./jfs-multi-outlet-client";

export class JfsIntegrationError extends Error {
  constructor(
    message: string,
    public status: number = 400,
    public code: string = "JFS_INTEGRATION_ERROR"
  ) {
    super(message);
    this.name = "JfsIntegrationError";
  }
}

export function maskAccount(account?: string | null): string {
  if (!account || typeof account !== "string") return "******";
  const trimmed = account.trim();
  if (trimmed.length <= 4) return "******";
  return `******${trimmed.slice(-4)}`;
}

export interface JfsConnectionStatusView {
  available: boolean;
  connected: boolean;
  outletCode: string;
  networkCode: string | null;
  status: "CONNECTED" | "DISCONNECTED" | "FAILED" | "NOT_CONFIGURED";
  accountMasked: string | null;
  lastConnectedAt: string | null;
  lastTestedAt: string | null;
}

async function callScopedConnection(
  scope: SettingsScope,
  outletCode: string,
  networkCode: string,
  account: string,
  password: string,
  operation: "SCOPED_RECONNECT" | "SCOPED_TEST_CONNECTION",
): Promise<{ networkCode: string; name: string }> {
  try {
    const result = await executeScopedJfsConnection(scope, operation, {
      account,
      password,
      outletCode,
      networkCode,
    });
    if (!result.networkCode) {
      throw new JfsIntegrationError("Response login JFS tidak valid.", 400, "JFS_INVALID_RESPONSE");
    }
    return { networkCode: result.networkCode.trim(), name: String(result.name || "").trim() };
  } catch (error) {
    if (error instanceof JfsIntegrationError) {
      throw error;
    }
    throw new JfsIntegrationError(
      "Gagal melakukan autentikasi JFS via middleware. " + (error instanceof Error ? error.message : ""),
      500,
      "MIDDLEWARE_CONNECTION_FAILED"
    );
  }
}

export async function getJfsIntegrationStatus(scope: SettingsScope): Promise<JfsConnectionStatusView> {
  const outlet = await prisma.outlet.findFirst({
    where: { id: scope.outletId, tenantId: scope.tenantId },
    select: { id: true, code: true, name: true },
  });

  if (!outlet) {
    throw new JfsIntegrationError("Outlet tidak ditemukan atau tidak memiliki akses.", 404, "OUTLET_NOT_FOUND");
  }

  const credential = await prisma.integrationCredential.findUnique({
    where: {
      tenantId_outletId_provider: {
        tenantId: scope.tenantId,
        outletId: scope.outletId,
        provider: "JFS",
      },
    },
  });

  if (!credential || credential.connectionStatus !== "CONNECTED" || !credential.isActive) {
    return {
      available: true,
      connected: false,
      outletCode: outlet.code,
      networkCode: credential?.networkCode ?? null,
      status: credential?.connectionStatus === "FAILED" ? "FAILED" : "DISCONNECTED",
      accountMasked: null,
      lastConnectedAt: credential?.lastConnectedAt?.toISOString() ?? null,
      lastTestedAt: credential?.lastTestedAt?.toISOString() ?? null,
    };
  }

  let accountMasked = "******";
  try {
    const decryptedPayload = decryptCredential<{ account: string }>(credential.accountEncrypted);
    accountMasked = maskAccount(decryptedPayload.account);
  } catch {
    accountMasked = "******";
  }

  return {
    available: true,
    connected: true,
    outletCode: outlet.code,
    networkCode: credential.networkCode,
    status: "CONNECTED",
    accountMasked,
    lastConnectedAt: credential.lastConnectedAt?.toISOString() ?? null,
    lastTestedAt: credential.lastTestedAt?.toISOString() ?? null,
  };
}

export async function connectJfsIntegration(
  scope: SettingsScope,
  input: { account?: string; password?: string }
): Promise<JfsConnectionStatusView> {
  const account = input.account ? String(input.account).trim() : "";
  const password = input.password ? String(input.password) : "";

  if (!account || !password) {
    throw new JfsIntegrationError("Account dan password JFS wajib diisi.", 400, "MISSING_CREDENTIALS");
  }

  const outlet = await prisma.outlet.findFirst({
    where: { id: scope.outletId, tenantId: scope.tenantId },
    select: { id: true, code: true, name: true },
  });

  if (!outlet) {
    throw new JfsIntegrationError("Outlet tidak ditemukan atau tidak memiliki akses.", 404, "OUTLET_NOT_FOUND");
  }

  // 1. Server-side JFS login call
  const loginResult = await callScopedConnection(
    scope, outlet.code, outlet.code, account, password, "SCOPED_RECONNECT",
  );
  const actualNetworkCode = loginResult.networkCode;

  // 2. Network Code Binding Check
  if (!isJfsNetworkAllowed({
    nextgenOutletCode: outlet.code,
    actualJfsNetwork: actualNetworkCode,
    environment: process.env.NEXTGEN_ENVIRONMENT,
    developmentMapping: process.env.JFS_DEV_NETWORK_MAPPING,
  })) {
    throw new JfsIntegrationError(
      `Akun JFS terhubung ke network yang berbeda dari outlet NEXTGEN (${actualNetworkCode} vs ${outlet.code}).`,
      400,
      "JFS_NETWORK_MISMATCH"
    );
  }

  // 3. Encrypt credentials
  const accountEncrypted = encryptCredential({ account });
  const passwordEncrypted = encryptCredential({ password });
  const now = new Date();

  // 4. Persist encrypted credentials cleanly
  const credential = await prisma.integrationCredential.upsert({
    where: {
      tenantId_outletId_provider: {
        tenantId: scope.tenantId,
        outletId: scope.outletId,
        provider: "JFS",
      },
    },
    create: {
      tenantId: scope.tenantId,
      outletId: scope.outletId,
      provider: "JFS",
      accountEncrypted,
      passwordEncrypted,
      networkCode: actualNetworkCode,
      networkName: loginResult.name,
      connectionStatus: "CONNECTED",
      lastConnectedAt: now,
      lastTestedAt: now,
      isActive: true,
    },
    update: {
      accountEncrypted,
      passwordEncrypted,
      networkCode: actualNetworkCode,
      networkName: loginResult.name,
      connectionStatus: "CONNECTED",
      lastConnectedAt: now,
      lastTestedAt: now,
      lastFailureAt: null,
      lastFailureCode: null,
      isActive: true,
    },
  });

  // Audit Log
  await prisma.auditLog.create({
    data: {
      tenantId: scope.tenantId,
      outletId: scope.outletId,
      action: "SETTINGS_TARGET_KPI_UPDATED", // Using standard AuditAction enum
      entityType: "JFS_INTEGRATION_CONNECTED",
      entityId: credential.id,
      metadata: {
        networkCode: actualNetworkCode,
        status: "CONNECTED",
      },
    },
  }).catch(() => null);

  return {
    available: true,
    connected: true,
    outletCode: outlet.code,
    networkCode: credential.networkCode,
    status: "CONNECTED",
    accountMasked: maskAccount(account),
    lastConnectedAt: now.toISOString(),
    lastTestedAt: now.toISOString(),
  };
}

export async function testJfsIntegration(scope: SettingsScope): Promise<JfsConnectionStatusView> {
  const credential = await prisma.integrationCredential.findUnique({
    where: {
      tenantId_outletId_provider: {
        tenantId: scope.tenantId,
        outletId: scope.outletId,
        provider: "JFS",
      },
    },
  });

  if (!credential || credential.connectionStatus !== "CONNECTED" || !credential.isActive) {
    throw new JfsIntegrationError("Integrasi JFS belum terhubung.", 400, "NOT_CONNECTED");
  }

  let account = "";
  let password = "";
  try {
    account = decryptCredential<{ account: string }>(credential.accountEncrypted).account;
    password = decryptCredential<{ password: string }>(credential.passwordEncrypted).password;
  } catch {
    throw new JfsIntegrationError("Gagal me-read credential terenkripsi.", 500, "DECRYPTION_FAILED");
  }

  const now = new Date();
  try {
    const outlet = await prisma.outlet.findFirst({
      where: { id: scope.outletId, tenantId: scope.tenantId },
      select: { code: true },
    });
    if (!outlet) throw new JfsIntegrationError("Outlet tidak ditemukan.", 404, "OUTLET_NOT_FOUND");
    const loginResult = await callScopedConnection(
      scope,
      outlet.code,
      credential.networkCode || outlet.code,
      account,
      password,
      "SCOPED_TEST_CONNECTION",
    );
    const actualNetworkCode = loginResult.networkCode;

    if (!isJfsNetworkAllowed({
      nextgenOutletCode: outlet.code,
      actualJfsNetwork: actualNetworkCode,
      environment: process.env.NEXTGEN_ENVIRONMENT,
      developmentMapping: process.env.JFS_DEV_NETWORK_MAPPING,
    })) {
      throw new JfsIntegrationError("Network JFS tidak sesuai dengan outlet aktif.", 400, "JFS_NETWORK_MISMATCH");
    }

    await prisma.integrationCredential.update({
      where: { id: credential.id },
      data: {
        connectionStatus: "CONNECTED",
        lastTestedAt: now,
        networkCode: actualNetworkCode,
      },
    });

    return {
      available: true,
      connected: true,
      outletCode: credential.networkCode || "",
      networkCode: actualNetworkCode,
      status: "CONNECTED",
      accountMasked: maskAccount(account),
      lastConnectedAt: credential.lastConnectedAt?.toISOString() ?? now.toISOString(),
      lastTestedAt: now.toISOString(),
    };
  } catch (error) {
    await prisma.integrationCredential.update({
      where: { id: credential.id },
      data: {
        connectionStatus: "FAILED",
        lastFailureAt: now,
        lastFailureCode: error instanceof JfsIntegrationError ? error.code : "LOGIN_FAILED",
      },
    });

    throw error;
  }
}

export async function reconnectJfsIntegration(scope: SettingsScope): Promise<JfsConnectionStatusView> {
  const credential = await prisma.integrationCredential.findUnique({
    where: {
      tenantId_outletId_provider: {
        tenantId: scope.tenantId,
        outletId: scope.outletId,
        provider: "JFS",
      },
    },
  });
  if (!credential || credential.connectionStatus !== "CONNECTED" || !credential.isActive) {
    throw new JfsIntegrationError("Integrasi JFS belum terhubung.", 400, "NOT_CONNECTED");
  }
  const outlet = await prisma.outlet.findFirst({
    where: { id: scope.outletId, tenantId: scope.tenantId },
    select: { code: true },
  });
  if (!outlet) throw new JfsIntegrationError("Outlet tidak ditemukan.", 404, "OUTLET_NOT_FOUND");

  let account: string;
  let password: string;
  try {
    account = decryptCredential<{ account: string }>(credential.accountEncrypted).account;
    password = decryptCredential<{ password: string }>(credential.passwordEncrypted).password;
  } catch {
    throw new JfsIntegrationError("Gagal me-read credential terenkripsi.", 500, "DECRYPTION_FAILED");
  }

  const result = await callScopedConnection(
    scope, outlet.code, credential.networkCode || outlet.code,
    account, password, "SCOPED_RECONNECT",
  );
  if (!isJfsNetworkAllowed({
    nextgenOutletCode: outlet.code,
    actualJfsNetwork: result.networkCode,
    environment: process.env.NEXTGEN_ENVIRONMENT,
    developmentMapping: process.env.JFS_DEV_NETWORK_MAPPING,
  })) {
    throw new JfsIntegrationError("Network JFS tidak sesuai dengan outlet aktif.", 400, "JFS_NETWORK_MISMATCH");
  }
  const now = new Date();
  await prisma.integrationCredential.update({
    where: { id: credential.id },
    data: {
      connectionStatus: "CONNECTED",
      lastConnectedAt: now,
      lastTestedAt: now,
      networkCode: result.networkCode,
      lastFailureAt: null,
      lastFailureCode: null,
    },
  });
  return {
    available: true,
    connected: true,
    outletCode: outlet.code,
    networkCode: result.networkCode,
    status: "CONNECTED",
    accountMasked: maskAccount(account),
    lastConnectedAt: now.toISOString(),
    lastTestedAt: now.toISOString(),
  };
}

export async function disconnectJfsIntegration(scope: SettingsScope): Promise<{ success: boolean; message: string }> {
  const credential = await prisma.integrationCredential.findUnique({
    where: {
      tenantId_outletId_provider: {
        tenantId: scope.tenantId,
        outletId: scope.outletId,
        provider: "JFS",
      },
    },
  });

  if (credential) {
    await prisma.integrationCredential.update({
      where: { id: credential.id },
      data: {
        connectionStatus: "DISCONNECTED",
        isActive: false,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: scope.tenantId,
        outletId: scope.outletId,
        action: "SETTINGS_TARGET_KPI_UPDATED",
        entityType: "JFS_INTEGRATION_DISCONNECTED",
        entityId: credential.id,
        metadata: {
          status: "DISCONNECTED",
        },
      },
    }).catch(() => null);
  }

  return {
    success: true,
    message: "Integrasi JFS berhasil diputuskan.",
  };
}
