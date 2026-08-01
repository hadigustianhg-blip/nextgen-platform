import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  jakartaCashflowDate,
  parseCashflowOutletIds,
  runJfsCashflowCron,
} from "./sync-jfs-cashflow";

afterEach(() => { process.exitCode = undefined; });

const outlet = { id: "outlet-1", tenantId: "tenant-1", code: "OUT001" };

describe("Cashflow JFS cron", () => {
  it("uses the current Asia/Jakarta date and CRON trigger for configured active outlets", async () => {
    const syncOutlet = vi.fn(async () => ({ success: true }));
    const result = await runJfsCashflowCron(["outlet-1"], {
      listOutlets: vi.fn(async () => [outlet]), syncOutlet,
      disconnect: vi.fn(async () => undefined), log: vi.fn(), error: vi.fn(),
      now: () => new Date("2026-08-01T16:00:00.000Z"),
    });
    expect(syncOutlet).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1", outletId: "outlet-1",
      startDate: "2026-08-01", endDate: "2026-08-01", triggerSource: "CRON",
    }));
    expect(result).toEqual({ success: 1, failed: 0, skipped: 0 });
  });

  it("continues when one outlet fails and skips inactive configured outlets", async () => {
    const syncOutlet = vi.fn()
      .mockRejectedValueOnce(new Error("SOURCE_UNAVAILABLE"))
      .mockResolvedValueOnce({ success: true });
    const result = await runJfsCashflowCron(["one", "two", "inactive"], {
      listOutlets: vi.fn(async () => [outlet, { ...outlet, id: "outlet-2", code: "OUT002" }]),
      syncOutlet, disconnect: vi.fn(async () => undefined),
      log: vi.fn(), error: vi.fn(), now: () => new Date("2026-08-01T16:00:00.000Z"),
    });
    expect(syncOutlet).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ success: 1, failed: 1, skipped: 1 });
  });

  it("treats an overlapping run as skipped and always disconnects", async () => {
    const disconnect = vi.fn(async () => undefined);
    const result = await runJfsCashflowCron(["one"], {
      listOutlets: vi.fn(async () => [outlet]),
      syncOutlet: vi.fn(async () => { throw new Error("ALREADY_RUNNING"); }),
      disconnect, log: vi.fn(), error: vi.fn(), now: () => new Date(),
    });
    expect(result).toEqual({ success: 0, failed: 0, skipped: 1 });
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("deduplicates outlet configuration and converts UTC to Jakarta", () => {
    expect(parseCashflowOutletIds(" one,two,one, ")).toEqual(["one", "two"]);
    expect(jakartaCashflowDate(new Date("2026-07-31T17:30:00.000Z"))).toBe("2026-08-01");
  });
});
