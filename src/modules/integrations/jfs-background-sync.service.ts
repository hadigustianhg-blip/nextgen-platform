import { executeTrustedMultiOutletScraper, type ScraperOperation } from "./jfs-multi-outlet-client";
import { prisma } from "@/lib/db/prisma";

const activeSyncLocks = new Set<string>();

export type SyncResultSummary = {
  tenantId: string;
  outletId: string;
  outletCode: string;
  operation: ScraperOperation;
  success: boolean;
  recordCount: number;
  durationMs: number;
  errorCode?: string;
  errorMessage?: string;
};

export async function runMultiOutletSyncForScope(
  tenantId: string,
  outletId: string,
  operations: ScraperOperation[] = ["WAYBILL_STATUS", "PICKUP", "DISPATCH", "COD"]
): Promise<SyncResultSummary[]> {
  const lockKey = `${tenantId}:${outletId}`;
  if (activeSyncLocks.has(lockKey)) {
    throw new Error(`Sync operation already in progress for outlet ${lockKey}`);
  }

  activeSyncLocks.add(lockKey);
  const results: SyncResultSummary[] = [];

  try {
    const credential = await prisma.integrationCredential.findUnique({
      where: {
        tenantId_outletId_provider: { tenantId, outletId, provider: "JFS" },
      },
      include: { outlet: { select: { code: true } } },
    });

    if (!credential || credential.connectionStatus !== "CONNECTED" || !credential.isActive) {
      throw new Error(`No active CONNECTED integration credential for ${lockKey}`);
    }

    const outletCode = credential.outlet?.code || credential.networkCode || "SUM001A";

    for (const op of operations) {
      const startTime = Date.now();
      try {
        const response = await executeTrustedMultiOutletScraper({ tenantId, outletId }, op, {
          startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          endDate: new Date().toISOString().slice(0, 10),
        });

        const durationMs = Date.now() - startTime;
        const recordCount = Array.isArray(response?.data)
          ? response.data.length
          : Array.isArray(response?.data?.list)
          ? response.data.list.length
          : response?.data?.fetchedCount ?? 0;

        results.push({
          tenantId,
          outletId,
          outletCode,
          operation: op,
          success: true,
          recordCount,
          durationMs,
        });
      } catch (err) {
        const durationMs = Date.now() - startTime;
        const errorMessage = err instanceof Error ? err.message : String(err);
        results.push({
          tenantId,
          outletId,
          outletCode,
          operation: op,
          success: false,
          recordCount: 0,
          durationMs,
          errorCode: "SYNC_FAILED",
          errorMessage,
        });
      }
    }

    const lastSuccess = results.some((r) => r.success);
    const now = new Date();

    await prisma.integrationCredential.update({
      where: { id: credential.id },
      data: {
        lastTestedAt: now,
        ...(lastSuccess ? { lastConnectedAt: now } : { lastFailureAt: now, lastFailureCode: "SYNC_PARTIAL_FAILURE" }),
      },
    });

    return results;
  } finally {
    activeSyncLocks.delete(lockKey);
  }
}

export async function runBackgroundSyncAllActiveOutlets(): Promise<Record<string, SyncResultSummary[]>> {
  const activeCredentials = await prisma.integrationCredential.findMany({
    where: { connectionStatus: "CONNECTED", isActive: true },
    select: { tenantId: true, outletId: true },
  });

  const syncOutcome: Record<string, SyncResultSummary[]> = {};

  for (const cred of activeCredentials) {
    const key = `${cred.tenantId}:${cred.outletId}`;
    try {
      syncOutcome[key] = await runMultiOutletSyncForScope(cred.tenantId, cred.outletId);
    } catch (err) {
      syncOutcome[key] = [
        {
          tenantId: cred.tenantId,
          outletId: cred.outletId,
          outletCode: "UNKNOWN",
          operation: "WAYBILL_STATUS",
          success: false,
          recordCount: 0,
          durationMs: 0,
          errorCode: "SYNC_LOCK_OR_FETCH_ERROR",
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      ];
    }
  }

  return syncOutcome;
}
