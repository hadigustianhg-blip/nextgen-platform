import { prisma } from "../src/lib/db/prisma";
import { runJfsCashflowSync } from "../src/modules/finance/jfs-cashflow.service";

type CronOutlet = { id: string; tenantId: string; code: string };
type CronDependencies = {
  listOutlets: (ids: string[]) => Promise<CronOutlet[]>;
  syncOutlet: (input: {
    tenantId: string; outletId: string; startDate: string; endDate: string;
    triggerSource: "CRON";
  }) => Promise<unknown>;
  disconnect: () => Promise<void>;
  log: (message: string) => void;
  error: (message: string) => void;
  now: () => Date;
};

export function parseCashflowOutletIds(value: string | undefined) {
  return [...new Set((value ?? "").split(",").map((item) => item.trim()).filter(Boolean))];
}

export function jakartaCashflowDate(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
}

export async function runJfsCashflowCron(
  configuredIds: string[],
  dependencies: CronDependencies,
) {
  const summary = { success: 0, failed: 0, skipped: 0 };
  const businessDate = jakartaCashflowDate(dependencies.now());
  dependencies.log(`[CASHFLOW JFS CRON] Started businessDate=${businessDate}`);
  try {
    if (configuredIds.length === 0) throw new Error("CASHFLOW_JFS_OUTLET_IDS belum dikonfigurasi.");
    const outlets = await dependencies.listOutlets(configuredIds);
    const missing = configuredIds.length - outlets.length;
    summary.skipped += missing;
    if (missing) dependencies.log(`[CASHFLOW JFS CRON] ${missing} configured outlet inactive or not found`);
    for (const outlet of outlets) {
      try {
        await dependencies.syncOutlet({
          tenantId: outlet.tenantId,
          outletId: outlet.id,
          startDate: businessDate,
          endDate: businessDate,
          triggerSource: "CRON",
        });
        summary.success += 1;
        dependencies.log(`[CASHFLOW JFS CRON] ${outlet.code} success businessDate=${businessDate}`);
      } catch (error) {
        if (error instanceof Error && error.message === "ALREADY_RUNNING") summary.skipped += 1;
        else summary.failed += 1;
        dependencies.error(`[CASHFLOW JFS CRON] ${outlet.code} failed code=${error instanceof Error ? error.message : "UNKNOWN"}`);
      }
    }
    if (outlets.length > 0 && summary.success === 0 && summary.failed > 0) process.exitCode = 1;
    return summary;
  } catch (error) {
    summary.failed += 1;
    process.exitCode = 1;
    dependencies.error(`[CASHFLOW JFS CRON] Fatal code=${error instanceof Error ? error.message : "UNKNOWN"}`);
    return summary;
  } finally {
    dependencies.log(`[CASHFLOW JFS CRON] Completed success=${summary.success} failed=${summary.failed} skipped=${summary.skipped}`);
    await dependencies.disconnect();
  }
}

if (process.env.NODE_ENV !== "test") {
  await runJfsCashflowCron(parseCashflowOutletIds(process.env.CASHFLOW_JFS_OUTLET_IDS), {
    listOutlets: (ids) => prisma.outlet.findMany({
      where: { id: { in: ids }, isActive: true, tenant: { status: "ACTIVE" } },
      select: { id: true, tenantId: true, code: true },
      orderBy: [{ tenantId: "asc" }, { code: "asc" }],
    }),
    syncOutlet: runJfsCashflowSync,
    disconnect: () => prisma.$disconnect(),
    log: console.log,
    error: console.error,
    now: () => new Date(),
  });
}
