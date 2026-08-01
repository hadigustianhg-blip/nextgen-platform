import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  CashflowCronEnvError,
  parseCashflowOutletIds,
  previousJakartaCashflowDate,
  runJfsCashflowCron,
  runJfsCashflowCronFromEnv,
  validateCashflowCronEnv,
} from "./sync-jfs-cashflow";

afterEach(() => { process.exitCode = undefined; });

const OUTLET_1 = "11111111-1111-4111-8111-111111111111";
const OUTLET_2 = "22222222-2222-4222-8222-222222222222";
const OUTLET_3 = "33333333-3333-4333-8333-333333333333";
const TENANT_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const outlet = { id: OUTLET_1, tenantId: TENANT_1, code: "OUT001" };
const validEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://runtime-db.example.test/nextgen",
  JFS_MIDDLEWARE_BASE_URL: "https://middleware.example.test",
  CASHFLOW_JFS_OUTLET_IDS: OUTLET_1,
};

const dependencies = (override: Partial<Parameters<typeof runJfsCashflowCron>[1]> = {}) => ({
  listOutlets: vi.fn(async () => [outlet]),
  syncOutlet: vi.fn(async () => ({
    fetchedCount: 4, createdCount: 2, updatedCount: 1, skippedCount: 1,
  })),
  disconnect: vi.fn(async () => undefined),
  log: vi.fn(),
  error: vi.fn(),
  now: () => new Date("2026-08-01T19:00:00.000Z"),
  ...override,
});

describe("Cashflow JFS cron environment", () => {
  it("accepts only the three minimum runtime variables", () => {
    expect(validateCashflowCronEnv(validEnv)).toEqual({
      databaseUrl: validEnv.DATABASE_URL,
      middlewareBaseUrl: "https://middleware.example.test/",
      outletIds: [OUTLET_1],
    });
  });

  it.each([
    ["DATABASE_URL", "DATABASE_URL_MISSING"],
    ["JFS_MIDDLEWARE_BASE_URL", "JFS_MIDDLEWARE_BASE_URL_MISSING"],
    ["CASHFLOW_JFS_OUTLET_IDS", "CASHFLOW_JFS_OUTLET_IDS_MISSING"],
  ])("rejects missing %s with a specific code", (name, code) => {
    const env = { ...validEnv, [name]: "" };
    expect(() => validateCashflowCronEnv(env)).toThrowError(expect.objectContaining({ code }));
  });

  it("trims and deduplicates UUIDs while rejecting codes and tenant-like invalid input", () => {
    expect(parseCashflowOutletIds(` ${OUTLET_1},${OUTLET_2},${OUTLET_1} `)).toEqual([OUTLET_1, OUTLET_2]);
    expect(() => parseCashflowOutletIds("SUM001A")).toThrowError(CashflowCronEnvError);
    expect(() => parseCashflowOutletIds("tenant-1")).toThrowError(expect.objectContaining({
      code: "CASHFLOW_JFS_OUTLET_IDS_INVALID_UUID",
    }));
  });

  it.each([
    ["notaurl", "JFS_MIDDLEWARE_BASE_URL_INVALID"],
    ["ftp://middleware.example.test", "JFS_MIDDLEWARE_BASE_URL_INVALID"],
    ["http://localhost:3000", "JFS_MIDDLEWARE_BASE_URL_LOCALHOST_FORBIDDEN"],
    ["http://127.0.0.1:3000", "JFS_MIDDLEWARE_BASE_URL_LOCALHOST_FORBIDDEN"],
  ])("rejects production middleware URL %s", (url, code) => {
    expect(() => validateCashflowCronEnv({
      ...validEnv, JFS_MIDDLEWARE_BASE_URL: url,
    })).toThrowError(expect.objectContaining({ code }));
  });
});

describe("Cashflow JFS cron execution", () => {
  it("runs the production flow through env, outlet lookup, sync counters, and disconnect", async () => {
    const deps = dependencies();
    const result = await runJfsCashflowCronFromEnv(validEnv, deps);
    expect(deps.listOutlets).toHaveBeenCalledWith([OUTLET_1]);
    expect(deps.syncOutlet).toHaveBeenCalledWith({
      tenantId: TENANT_1, outletId: OUTLET_1,
      startDate: "2026-08-01", endDate: "2026-08-01", triggerSource: "CRON",
    });
    expect(result).toEqual({ success: 1, failed: 0, skipped: 0, businessDate: "2026-08-01" });
    expect(deps.log).toHaveBeenCalledWith(`[CASHFLOW JFS CRON] Outlet start outletId=${OUTLET_1}`);
    expect(deps.log).toHaveBeenCalledWith(
      `[CASHFLOW JFS CRON] Outlet completed outletId=${OUTLET_1} fetched=4 created=2 updated=1 skipped=1`,
    );
    expect(deps.disconnect).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(0);
  });

  it("returns exit 0 for ALREADY_RUNNING", async () => {
    const deps = dependencies({
      syncOutlet: vi.fn(async () => { throw new Error("ALREADY_RUNNING"); }),
    });
    const result = await runJfsCashflowCron([OUTLET_1], deps);
    expect(result).toEqual({ success: 0, failed: 0, skipped: 1, businessDate: "2026-08-01" });
    expect(process.exitCode).toBe(0);
  });

  it("fails specifically when a configured outlet is missing or inactive", async () => {
    const deps = dependencies({ listOutlets: vi.fn(async () => []) });
    const result = await runJfsCashflowCron([OUTLET_1], deps);
    expect(result.failed).toBe(1);
    expect(process.exitCode).toBe(1);
    expect(deps.error).toHaveBeenCalledWith(
      `[CASHFLOW JFS CRON] Outlet failed outletId=${OUTLET_1} code=OUTLET_NOT_FOUND_OR_INACTIVE`,
    );
  });

  it.each(["SOURCE_UNAVAILABLE", "DATABASE_ERROR"])(
    "sets exit 1 for a real outlet failure %s",
    async (code) => {
      const deps = dependencies({ syncOutlet: vi.fn(async () => { throw new Error(code); }) });
      const result = await runJfsCashflowCron([OUTLET_1], deps);
      expect(result.failed).toBe(1);
      expect(process.exitCode).toBe(1);
      expect(deps.disconnect).toHaveBeenCalledOnce();
    },
  );

  it("continues after one outlet fails", async () => {
    const deps = dependencies({
      listOutlets: vi.fn(async () => [outlet, { ...outlet, id: OUTLET_2 }]),
      syncOutlet: vi.fn()
        .mockRejectedValueOnce(new Error("SOURCE_UNAVAILABLE"))
        .mockResolvedValueOnce({ fetchedCount: 0, createdCount: 0, updatedCount: 0, skippedCount: 0 }),
    });
    const result = await runJfsCashflowCron([OUTLET_1, OUTLET_2], deps);
    expect(result).toMatchObject({ success: 1, failed: 1, skipped: 0 });
    expect(deps.syncOutlet).toHaveBeenCalledTimes(2);
    expect(process.exitCode).toBe(1);
  });

  it("fails env validation before outlet lookup and still disconnects", async () => {
    const deps = dependencies();
    const result = await runJfsCashflowCronFromEnv({ ...validEnv, CASHFLOW_JFS_OUTLET_IDS: OUTLET_3.slice(0, -1) }, deps);
    expect(result.failed).toBe(1);
    expect(deps.listOutlets).not.toHaveBeenCalled();
    expect(deps.disconnect).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(1);
  });

  it("a same-day rerun remains successful and delegates idempotency to shared sync", async () => {
    const syncOutlet = vi.fn(async () => ({
      fetchedCount: 1, createdCount: 0, updatedCount: 0, skippedCount: 1,
    }));
    const first = await runJfsCashflowCron([OUTLET_1], dependencies({ syncOutlet }));
    const second = await runJfsCashflowCron([OUTLET_1], dependencies({ syncOutlet }));
    expect(first.failed).toBe(0);
    expect(second.failed).toBe(0);
    expect(syncOutlet).toHaveBeenCalledTimes(2);
  });
});

describe("Cashflow JFS cron dates and runtime boundary", () => {
  it.each([
    ["2026-08-01T19:00:00.000Z", "2026-08-01"],
    ["2026-07-31T19:00:00.000Z", "2026-07-31"],
    ["2026-12-31T19:00:00.000Z", "2026-12-31"],
  ])("at Jakarta 02:00 for %s synchronizes previous date %s", (now, expected) => {
    expect(previousJakartaCashflowDate(new Date(now))).toBe(expected);
  });

  it("keeps the cron core pure and the start command one-shot", async () => {
    const [script, service, core, packageJson] = await Promise.all([
      readFile(new URL("./sync-jfs-cashflow.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/modules/finance/jfs-cashflow.service.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/modules/finance/jfs-cashflow.core.ts", import.meta.url), "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
    ]);
    expect(script).toContain("jfs-cashflow.core");
    expect(service).toContain('import "server-only"');
    expect(core).not.toContain('import "server-only"');
    expect(JSON.parse(packageJson).scripts["cron:jfs-cashflow"]).toBe("tsx scripts/sync-jfs-cashflow.ts");
  });
});
