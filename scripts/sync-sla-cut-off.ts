import { prisma } from "../src/lib/db/prisma";
import { syncSlaCutOffForOutlet } from "../src/modules/quality-control/sla-cut-off-sync.service";

type CronOutlet = { id: string; tenantId: string; code: string };
type CronDependencies = {
  listOutlets: (ids: string[]) => Promise<CronOutlet[]>;
  syncOutlet: typeof syncSlaCutOffForOutlet;
  disconnect: () => Promise<void>;
  log: (message: string) => void;
  error: (message: string) => void;
  now: () => Date;
};

export function parseConfiguredOutletIds(value: string | undefined) {
  return [...new Set((value ?? "").split(",").map((item) => item.trim()).filter(Boolean))];
}

export async function runSlaCutOffCron(
  configuredIds: string[],
  dependencies: CronDependencies,
) {
  const summary = { success: 0, failed: 0, skipped: 0 };
  dependencies.log(`[SLA CRON] Started at ${dependencies.now().toISOString()}`);
  try {
    if (configuredIds.length === 0) {
      throw new Error("SLA_CUT_OFF_OUTLET_IDS belum dikonfigurasi.");
    }
    const outlets = await dependencies.listOutlets(configuredIds);
    const missing = configuredIds.length - outlets.length;
    summary.skipped += missing;
    if (missing) dependencies.log(`[SLA CRON] ${missing} configured outlet inactive or not found`);
    for (const outlet of outlets) {
      try {
        const result = await dependencies.syncOutlet({
          tenantId: outlet.tenantId,
          outletId: outlet.id,
          expectedNetworkName: outlet.code,
          actor: { actorType: "SYSTEM" },
          requireCurrentJakartaDate: true,
        });
        if (result.result === "SKIPPED") {
          summary.skipped += 1;
          dependencies.log(`[SLA CRON] ${outlet.code} skipped, reason=${result.reason}`);
        } else {
          summary.success += 1;
          dependencies.log(`[SLA CRON] ${outlet.code} success, businessDate=${result.businessDate}, action=${result.result.toLowerCase()}`);
        }
      } catch (error) {
        summary.failed += 1;
        dependencies.error(`[SLA CRON] ${outlet.code} failed: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
    if (outlets.length > 0 && summary.success === 0 && summary.failed > 0) {
      process.exitCode = 1;
    }
    return summary;
  } catch (error) {
    summary.failed += 1;
    process.exitCode = 1;
    dependencies.error(`[SLA CRON] Fatal: ${error instanceof Error ? error.message : "unknown error"}`);
    return summary;
  } finally {
    dependencies.log(`[SLA CRON] Completed: success=${summary.success} failed=${summary.failed} skipped=${summary.skipped}`);
    await dependencies.disconnect();
  }
}

if (process.env.NODE_ENV !== "test") {
  await runSlaCutOffCron(parseConfiguredOutletIds(process.env.SLA_CUT_OFF_OUTLET_IDS), {
    listOutlets: (ids) => prisma.outlet.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true, tenantId: true, code: true },
      orderBy: [{ tenantId: "asc" }, { code: "asc" }],
    }),
    syncOutlet: syncSlaCutOffForOutlet,
    disconnect: () => prisma.$disconnect(),
    log: console.log,
    error: console.error,
    now: () => new Date(),
  });
}
