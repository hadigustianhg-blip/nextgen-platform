import { prisma } from "../src/lib/db/prisma";
import { runJfsCashflowSync } from "../src/modules/finance/jfs-cashflow.core";

type CronOutlet = { id: string; tenantId: string; code: string };
type CronSyncResult = {
  fetchedCount?: number;
  createdCount?: number;
  updatedCount?: number;
  skippedCount?: number;
};
type CronDependencies = {
  listOutlets: (ids: string[]) => Promise<CronOutlet[]>;
  syncOutlet: (input: {
    tenantId: string; outletId: string; startDate: string; endDate: string;
    triggerSource: "CRON";
  }) => Promise<CronSyncResult>;
  disconnect: () => Promise<void>;
  log: (message: string) => void;
  error: (message: string) => void;
  now: () => Date;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CashflowCronEnvError extends Error {
  constructor(public readonly code: string) { super(code); }
}

export function parseCashflowOutletIds(value: string | undefined) {
  const ids = [...new Set((value ?? "").split(",").map((item) => item.trim()).filter(Boolean))];
  if (ids.length === 0) throw new CashflowCronEnvError("CASHFLOW_JFS_OUTLET_IDS_MISSING");
  if (ids.some((id) => !UUID_PATTERN.test(id))) {
    throw new CashflowCronEnvError("CASHFLOW_JFS_OUTLET_IDS_INVALID_UUID");
  }
  return ids;
}

export function validateCashflowCronEnv(env: NodeJS.ProcessEnv) {
  if (!env.DATABASE_URL?.trim()) throw new CashflowCronEnvError("DATABASE_URL_MISSING");
  const middlewareValue = env.JFS_MIDDLEWARE_BASE_URL?.trim();
  if (!middlewareValue) throw new CashflowCronEnvError("JFS_MIDDLEWARE_BASE_URL_MISSING");
  let middlewareUrl: URL;
  try {
    middlewareUrl = new URL(middlewareValue);
  } catch {
    throw new CashflowCronEnvError("JFS_MIDDLEWARE_BASE_URL_INVALID");
  }
  if (!["http:", "https:"].includes(middlewareUrl.protocol)) {
    throw new CashflowCronEnvError("JFS_MIDDLEWARE_BASE_URL_INVALID");
  }
  if (
    env.NODE_ENV === "production" &&
    ["localhost", "127.0.0.1", "::1"].includes(middlewareUrl.hostname)
  ) {
    throw new CashflowCronEnvError("JFS_MIDDLEWARE_BASE_URL_LOCALHOST_FORBIDDEN");
  }
  return {
    databaseUrl: env.DATABASE_URL.trim(),
    middlewareBaseUrl: middlewareUrl.toString(),
    outletIds: parseCashflowOutletIds(env.CASHFLOW_JFS_OUTLET_IDS),
  };
}

export function previousJakartaCashflowDate(now: Date) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
  const previousDate = new Date(`${today}T00:00:00.000Z`);
  previousDate.setUTCDate(previousDate.getUTCDate() - 1);
  return previousDate.toISOString().slice(0, 10);
}

const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
const errorCode = (error: unknown) => error instanceof Error && error.message ? error.message : "UNKNOWN";

export async function runJfsCashflowCron(
  configuredIds: string[],
  dependencies: CronDependencies,
) {
  process.exitCode = 0;
  const summary = { success: 0, failed: 0, skipped: 0 };
  const businessDate = previousJakartaCashflowDate(dependencies.now());
  dependencies.log(`[CASHFLOW JFS CRON] Started businessDate=${businessDate}`);
  try {
    const outlets = await dependencies.listOutlets(configuredIds);
    const outletById = new Map(outlets.map((outlet) => [outlet.id, outlet]));
    for (const outletId of configuredIds) {
      const outlet = outletById.get(outletId);
      if (!outlet) {
        summary.failed += 1;
        dependencies.error(`[CASHFLOW JFS CRON] Outlet failed outletId=${outletId} code=OUTLET_NOT_FOUND_OR_INACTIVE`);
        continue;
      }
      dependencies.log(`[CASHFLOW JFS CRON] Outlet start outletId=${outlet.id}`);
      try {
        const result = await dependencies.syncOutlet({
          tenantId: outlet.tenantId,
          outletId: outlet.id,
          startDate: businessDate,
          endDate: businessDate,
          triggerSource: "CRON",
        });
        summary.success += 1;
        dependencies.log(
          `[CASHFLOW JFS CRON] Outlet completed outletId=${outlet.id}`
          + ` fetched=${count(result.fetchedCount)} created=${count(result.createdCount)}`
          + ` updated=${count(result.updatedCount)} skipped=${count(result.skippedCount)}`,
        );
      } catch (error) {
        const code = errorCode(error);
        if (code === "ALREADY_RUNNING") {
          summary.skipped += 1;
          dependencies.log(`[CASHFLOW JFS CRON] Outlet skipped outletId=${outlet.id} code=ALREADY_RUNNING`);
        } else {
          summary.failed += 1;
          dependencies.error(`[CASHFLOW JFS CRON] Outlet failed outletId=${outlet.id} code=${code}`);
        }
      }
    }
    process.exitCode = summary.failed > 0 ? 1 : 0;
    return { ...summary, businessDate };
  } catch (error) {
    summary.failed += 1;
    process.exitCode = 1;
    dependencies.error(`[CASHFLOW JFS CRON] Fatal code=${errorCode(error)}`);
    return { ...summary, businessDate };
  } finally {
    dependencies.log(`[CASHFLOW JFS CRON] Completed success=${summary.success} failed=${summary.failed} skipped=${summary.skipped}`);
    await dependencies.disconnect();
  }
}

export async function runJfsCashflowCronFromEnv(
  env: NodeJS.ProcessEnv,
  dependencies: CronDependencies,
) {
  try {
    const config = validateCashflowCronEnv(env);
    return await runJfsCashflowCron(config.outletIds, dependencies);
  } catch (error) {
    process.exitCode = 1;
    const businessDate = previousJakartaCashflowDate(dependencies.now());
    dependencies.error(`[CASHFLOW JFS CRON] Fatal code=${errorCode(error)}`);
    dependencies.log("[CASHFLOW JFS CRON] Completed success=0 failed=1 skipped=0");
    await dependencies.disconnect();
    return { success: 0, failed: 1, skipped: 0, businessDate };
  }
}

if (process.env.NODE_ENV !== "test") {
  await runJfsCashflowCronFromEnv(process.env, {
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
