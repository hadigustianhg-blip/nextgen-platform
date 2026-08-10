import type { SessionContext } from "@/lib/auth/session";

export type SettingsScope = { tenantId: string; outletId: string };
export type SettingsActor = SettingsScope & { userId: string };

export type JfsConnectionStatus = "NOT_CONFIGURED" | "CONNECTED" | "RELOGIN_REQUIRED" | "DEGRADED" | "DISCONNECTED" | "FAILED";
export type IntegrationDatasetStatus = "SUCCESS" | "FAILED" | "RUNNING" | "NEVER_SYNCED" | "STALE" | "UNAVAILABLE";
export type IntegrationDatasetKey = "PICKUP" | "DISPATCH" | "COD" | "CASHFLOW" | "SLA" | "OMS" | "AGING_SIGN" | "INVENTORY";

export type IntegrationSummary = {
  jfsConnectionStatus: JfsConnectionStatus;
  middlewareStatus: "ONLINE" | "OFFLINE" | "NOT_CONFIGURED";
  databaseStatus: "CONNECTED" | "DEGRADED";
  applicationDomain: string | null;
};

export type IntegrationConnectionView = {
  available: boolean;
  connected?: boolean;
  outletCode: string;
  networkCode?: string | null;
  status: string;
  accountMasked?: string | null;
  lastConnectedAt?: string | null;
  lastTestedAt?: string | null;
  lastLoginAt?: string | null;
};

export type IntegrationDatasetView = {
  key: IntegrationDatasetKey;
  label: string;
  status: IntegrationDatasetStatus;
  lastSyncedAt: Date | null;
  resultSummary: string;
  recordCount: number | null;
  errorCode: string | null;
  detailAvailable: boolean;
};

export type IntegrationActivityView = {
  id: string;
  occurredAt: Date;
  integration: string;
  activity: string;
  status: "SUCCESS" | "FAILED" | "RUNNING" | "INFO";
  summary: string;
};

export type IntegrationControlCenter = {
  summary: IntegrationSummary;
  connection: IntegrationConnectionView;
  datasets: IntegrationDatasetView[];
  infrastructure: {
    middlewareHostMasked: string | null;
    middlewareStatus: IntegrationSummary["middlewareStatus"];
    databaseStatus: IntegrationSummary["databaseStatus"];
    applicationDomain: string | null;
    salaryCardStatus: "ACTIVE" | "READY";
    cron: Array<{ key: "CASHFLOW" | "OPERATIONAL"; lastRunAt: Date | null }>;
    lastSuccessfulSync: Date | null;
    lastFailedSync: Date | null;
  };
  activities: IntegrationActivityView[];
};

export function buildTenantOutletWhere(scope: SettingsScope): SettingsScope {
  return { tenantId: scope.tenantId, outletId: scope.outletId };
}

export function buildOutletWhere(scope: SettingsScope) {
  return { tenantId: scope.tenantId, id: scope.outletId };
}

export function settingsScope(session: SessionContext): SettingsActor | null {
  return session.outletId
    ? { tenantId: session.tenantId, outletId: session.outletId, userId: session.userId }
    : null;
}
