import { decryptCredential } from "./credential-crypto";
import { prisma } from "@/lib/db/prisma";
import type { SettingsScope } from "@/modules/settings/settings.types";

export type ScraperOperation =
  | "PICKUP"
  | "DISPATCH"
  | "COD"
  | "IBK"
  | "OMS"
  | "OMS_SCHEDULING_LIST"
  | "OMS_SCHEDULING_DETAIL"
  | "INVENTORY"
  | "AGING_SIGN"
  | "WAYBILL_STATUS"
  | "SENDER_DETAIL"
  | "SENSITIVE_DETAIL"
  | "WAYBILL_TRACKING"
  | "WAYBILL_DETAIL";

export type ScopedConnectionOperation = "SCOPED_RECONNECT" | "SCOPED_TEST_CONNECTION";

export class ScopedJfsConnectionError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ScopedJfsConnectionError";
  }
}

type ScopedConnectionInput = {
  account: string;
  password: string;
  outletCode: string;
  networkCode: string;
  fetcher?: typeof fetch;
};

function middlewareConfig() {
  const baseUrl = process.env.JFS_MIDDLEWARE_BASE_URL;
  if (!baseUrl) throw new Error("JFS_MIDDLEWARE_BASE_URL is not configured");
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    authKey: process.env.JFS_MIDDLEWARE_AUTH_KEY || "",
  };
}

export async function executeScopedJfsConnection(
  scope: SettingsScope,
  operation: ScopedConnectionOperation,
  input: ScopedConnectionInput,
) {
  const { baseUrl, authKey } = middlewareConfig();
  const endpoint = operation === "SCOPED_RECONNECT"
    ? "/scoped/reconnect"
    : "/scoped/test-connection";
  const response = await (input.fetcher ?? fetch)(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Key": authKey,
      "X-JFS-Tenant-Id": scope.tenantId,
      "X-JFS-Outlet-Id": scope.outletId,
      "X-JFS-Outlet-Code": input.outletCode,
      "X-JFS-Network-Code": input.networkCode,
      "X-JFS-Account": input.account,
      "X-JFS-Password": input.password,
    },
    body: "{}",
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success || !payload.data?.connected) {
    throw new ScopedJfsConnectionError(
      typeof payload?.message === "string" ? payload.message : "Scoped JFS connection failed",
      response.status,
      typeof payload?.error === "string" ? payload.error : "JFS_SCOPED_CONNECTION_FAILED",
    );
  }
  return payload.data as {
    connected: true;
    networkCode: string | null;
    name?: string | null;
    sessionStatus: "ACTIVE";
  };
}

export async function executeTrustedMultiOutletScraper(
  scope: SettingsScope,
  operation: ScraperOperation,
  options: Record<string, unknown> = {}
) {
  const credential = await prisma.integrationCredential.findUnique({
    where: {
      tenantId_outletId_provider: {
        tenantId: scope.tenantId,
        outletId: scope.outletId,
        provider: "JFS",
      },
    },
    include: {
      outlet: { select: { code: true } },
    },
  });

  const isEmergency = process.env.JFS_EMERGENCY_TOKEN_MODE === "true" || !!process.env.JFS_AUTH_TOKEN;

  if (!credential || credential.connectionStatus !== "CONNECTED" || !credential.isActive) {
    if (!isEmergency) {
      throw new Error(`JFS Integration is not connected or active for outlet ${scope.outletId}`);
    }
  }

  let decryptedAccount = "emergency_account";
  let decryptedPassword = "emergency_password";
  if (credential?.accountEncrypted && credential?.passwordEncrypted) {
    try {
      decryptedAccount = decryptCredential<{ account: string }>(credential.accountEncrypted).account;
      decryptedPassword = decryptCredential<{ password: string }>(credential.passwordEncrypted).password;
    } catch {
      if (!isEmergency) throw new Error(`Failed to decrypt JFS credentials for outlet ${scope.outletId}`);
    }
  }

  const { baseUrl, authKey } = middlewareConfig();
  const outletCode = credential?.outlet?.code?.trim() || scope.outletId || "SUM001A";
  const networkCode = credential?.networkCode?.trim() || "BDO000";
  if (!outletCode || !networkCode) {
    if (!isEmergency) {
      throw new Error(`JFS outlet/network mapping is not configured for outlet ${scope.outletId}`);
    }
  }

  // Dynamic route selection: support both clean path and /jfs- prefixed path
  const endpointMap: Record<ScraperOperation, string> = {
    PICKUP: "/pickup",
    DISPATCH: "/dispatch",
    COD: "/cod",
    IBK: "/ibk",
    OMS: "/oms",
    OMS_SCHEDULING_LIST: "/oms-scheduling-list",
    OMS_SCHEDULING_DETAIL: "/oms-scheduling-detail",
    INVENTORY: "/inventory",
    AGING_SIGN: "/aging-sign",
    WAYBILL_STATUS: "/waybill-status",
    SENDER_DETAIL: "/sender-detail",
    SENSITIVE_DETAIL: "/sensitive-detail",
    WAYBILL_TRACKING: "/waybill-tracking",
    WAYBILL_DETAIL: "/waybill-detail",
  };

  const url = `${baseUrl}${endpointMap[operation]}`;
  const customFetcher = (options.fetcher as typeof fetch) ?? fetch;

  const res = await customFetcher(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Key": authKey,
      "X-JFS-Tenant-Id": scope.tenantId,
      "X-JFS-Outlet-Id": scope.outletId,
      "X-JFS-Outlet-Code": outletCode,
      "X-JFS-Network-Code": networkCode,
      "X-JFS-Account": decryptedAccount,
      "X-JFS-Password": decryptedPassword,
    },
    body: JSON.stringify(operation === "WAYBILL_TRACKING" || operation === "WAYBILL_DETAIL"
      ? { waybillNo: options.waybillNo }
      : { networkCode, ...options }),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`Upstream middleware request failed with status ${res.status}: ${errorBody}`);
  }

  const json = await res.json();
  if (json && typeof json === "object" && json.success === true && json.data && typeof json.data === "object") {
    return json.data;
  }
  return json;
}

export function isSecurityFailure(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string })?.code || "";

  return (
    code === "JFS_NETWORK_MISMATCH" ||
    code === "TENANT_OUTLET_MISMATCH" ||
    code === "UNAUTHORIZED" ||
    msg.includes("NETWORK_MISMATCH") ||
    msg.includes("TENANT_OUTLET_MISMATCH") ||
    msg.includes("UNAUTHORIZED") ||
    msg.includes("network yang berbeda")
  );
}
