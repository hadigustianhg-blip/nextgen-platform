import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseConfiguredOutletIds, runSlaCutOffCron } from "./sync-sla-cut-off";

afterEach(() => {
  process.exitCode = undefined;
});

const outlet = { id: "outlet-1", tenantId: "tenant-1", code: "SUM001A" };

describe("SLA cron", () => {
  it("processes only configured active outlets without a user session", async () => {
    const syncOutlet = vi.fn(async () => ({
      result: "UPDATED" as const,
      businessDate: "2026-07-29",
      sourceRecordKey: "SUM001A:2026-07-29",
      attempts: 1,
    }));
    const listOutlets = vi.fn(async () => [outlet]);
    const disconnect = vi.fn(async () => undefined);
    const result = await runSlaCutOffCron(["outlet-1"], {
      listOutlets, syncOutlet, disconnect,
      log: vi.fn(), error: vi.fn(),
      now: () => new Date("2026-07-29T16:40:00.000Z"),
    });
    expect(listOutlets).toHaveBeenCalledWith(["outlet-1"]);
    expect(syncOutlet).toHaveBeenCalledWith(expect.objectContaining({
      actor: { actorType: "SYSTEM" },
      requireCurrentJakartaDate: true,
    }));
    expect(result.success).toBe(1);
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("continues after one outlet fails and always disconnects", async () => {
    const syncOutlet = vi.fn()
      .mockRejectedValueOnce(new Error("source failed"))
      .mockResolvedValueOnce({ result: "CREATED", businessDate: "2026-07-29", sourceRecordKey: "SUM002A:2026-07-29", attempts: 1 });
    const disconnect = vi.fn(async () => undefined);
    const result = await runSlaCutOffCron(["one", "two"], {
      listOutlets: async () => [outlet, { ...outlet, id: "outlet-2", code: "SUM002A" }],
      syncOutlet, disconnect, log: vi.fn(), error: vi.fn(),
      now: () => new Date("2026-07-29T16:40:00.000Z"),
    });
    expect(syncOutlet).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ success: 1, failed: 1 });
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("disconnects and fails safely on fatal configuration errors", async () => {
    const disconnect = vi.fn(async () => undefined);
    const result = await runSlaCutOffCron([], {
      listOutlets: vi.fn(), syncOutlet: vi.fn(), disconnect,
      log: vi.fn(), error: vi.fn(), now: () => new Date(),
    });
    expect(result.failed).toBe(1);
    expect(process.exitCode).toBe(1);
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("deduplicates configured outlet IDs", () => {
    expect(parseConfiguredOutletIds(" one, two,one, ")).toEqual(["one", "two"]);
  });

  it("manual route imports the same shared service", async () => {
    const source = await readFile(
      new URL("../src/app/api/quality-control/sla-cut-off/sync/route.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("syncSlaCutOffForOutlet");
    expect(source).toContain('actorType: "USER"');
  });
});
