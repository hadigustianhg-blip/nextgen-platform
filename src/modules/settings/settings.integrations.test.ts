import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const db = vi.hoisted(() => ({
  outlet: { findFirst: vi.fn(), count: vi.fn() },
  syncRun: { findMany: vi.fn() },
  jfsCashflowSyncRun: { findMany: vi.fn() },
  salaryPublicationShare: { count: vi.fn() },
  auditLog: { findMany: vi.fn() },
  integrationCredential: { findUnique: vi.fn() },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import { getIntegrationStatus } from "./settings.service";

const uiSource = readFileSync(new URL("../../components/settings/settings-integrations.tsx", import.meta.url), "utf8");
const scope = { tenantId: "tenant-1", outletId: "outlet-1" };
const completedAt = new Date("2026-08-03T02:00:00.000Z");

describe("Settings Integration control center", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("JFS_MIDDLEWARE_BASE_URL", "https://jfs-middleware-production.up.railway.app");
    vi.stubEnv("SALARY_PUBLIC_BASE_URL", "https://app.nextgen-platform.com");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200 }));
    db.outlet.findFirst.mockResolvedValue({ id: "outlet-1", code: "SUM001A" });
    db.integrationCredential.findUnique.mockResolvedValue(null);
    db.salaryPublicationShare.count.mockResolvedValue(2);
    db.auditLog.findMany.mockResolvedValue([{ id: 10n, createdAt: completedAt, entityType: "INTEGRATION_CONNECTION_TESTED", action: "UPDATE" }]);
    db.syncRun.findMany.mockResolvedValue([
      { id: "pickup-run", runType: "PICKUP", status: "SUCCESS", startedAt: completedAt, completedAt, pickupFetchedCount: 12, dispatchFetchedCount: 0, codFetchedCount: 0, anomalyCount: 0 },
      { id: "dispatch-run", runType: "DISPATCH", status: "FAILED", startedAt: completedAt, completedAt, pickupFetchedCount: 0, dispatchFetchedCount: 8, codFetchedCount: 0, anomalyCount: 1 },
      { id: "cod-run", runType: "COD", status: "PARTIAL_SUCCESS", startedAt: completedAt, completedAt, pickupFetchedCount: 0, dispatchFetchedCount: 0, codFetchedCount: 20, anomalyCount: 2 },
    ]);
    db.jfsCashflowSyncRun.findMany.mockResolvedValue([{ id: "cashflow-run", status: "SUCCESS", startedAt: completedAt, completedAt, fetchedCount: 9, anomalyCount: 0, errorCode: null }]);
  });

  it("returns the canonical typed contract for integration status", async () => {
    const result = await getIntegrationStatus(scope);
    expect(result.summary.middlewareStatus).toBe("ONLINE");
    expect(result.summary.databaseStatus).toBe("CONNECTED");
    expect(result.connection).toEqual({ available: true, connected: false, outletCode: "SUM001A", networkCode: null, status: "DISCONNECTED", accountMasked: null, lastConnectedAt: null, lastTestedAt: null });
    expect(result.datasets.find(({ key }) => key === "PICKUP")).toMatchObject({ status: "SUCCESS", recordCount: 12 });
    expect(result.datasets.find(({ key }) => key === "DISPATCH")).toMatchObject({ status: "FAILED", errorCode: "SYNC_FAILED" });
    expect(result.datasets.find(({ key }) => key === "COD")).toMatchObject({ status: "STALE", errorCode: "PARTIAL_SUCCESS" });
    expect(result.datasets.find(({ key }) => key === "CASHFLOW")).toMatchObject({ status: "SUCCESS", recordCount: 9 });
  });

  it("marks datasets without canonical run models as unavailable instead of inventing status", async () => {
    const result = await getIntegrationStatus(scope);
    for (const key of ["SLA", "OMS", "AGING_SIGN", "INVENTORY"]) expect(result.datasets.find((item) => item.key === key)).toMatchObject({ status: "UNAVAILABLE", detailAvailable: false, recordCount: null });
  });

  it("masks middleware host, keeps the app domain dynamic, and never returns credentials", async () => {
    const result = await getIntegrationStatus(scope);
    expect(result.infrastructure.middlewareHostMasked).toBe("jfs-***.up.railway.app");
    expect(result.summary.applicationDomain).toBe("app.nextgen-platform.com");
    const serialized = JSON.stringify(result);
    for (const secret of ["password", "encryptedPayload", "AUTH_TOKEN", "JFS_AUTH_KEY", "DATABASE_URL", "cookie", "stack"]) expect(serialized).not.toContain(secret);
  });

  it("scopes all integration data to the session tenant/outlet and excludes audit metadata", async () => {
    await getIntegrationStatus(scope);
    expect(db.syncRun.findMany.mock.calls[0][0].where).toEqual(scope);
    expect(db.jfsCashflowSyncRun.findMany.mock.calls[0][0].where).toEqual(scope);
    expect(db.auditLog.findMany.mock.calls[0][0].where.tenantId).toBe("tenant-1");
    expect(db.auditLog.findMany.mock.calls[0][0].where.AND[0]).toEqual({ OR: [{ outletId: "outlet-1" }, { outletId: null }] });
    expect(db.auditLog.findMany.mock.calls[0][0].select).not.toHaveProperty("metadata");
  });

  it("uses only safe generic error codes when a source contains an unsafe error value", async () => {
    db.jfsCashflowSyncRun.findMany.mockResolvedValue([{ id: "cashflow-run", status: "FAILED", startedAt: completedAt, completedAt, fetchedCount: 0, anomalyCount: 0, errorCode: "stack trace: credential=secret" }]);
    const result = await getIntegrationStatus(scope);
    expect(result.datasets.find(({ key }) => key === "CASHFLOW")?.errorCode).toBe("SYNC_FAILED");
    expect(JSON.stringify(result.activities)).not.toContain("stack trace");
  });

  it("renders a professional UI with self-service connection actions, Eye/EyeOff password toggle, and no raw JSON pre elements", () => {
    for (const section of ["Ringkasan Integrasi", "Koneksi Akun JFS", "Status Sinkronisasi", "Infrastruktur", "Riwayat Aktivitas Integrasi"]) expect(uiSource).toContain(section);
    for (const action of ["Hubungkan JFS", "Test Koneksi", "Putuskan Koneksi"]) expect(uiSource).toContain(action);
    expect(uiSource).toContain("showPassword");
    expect(uiSource).toContain("EyeOff");
    expect(uiSource).not.toContain("<pre");
  });
});
