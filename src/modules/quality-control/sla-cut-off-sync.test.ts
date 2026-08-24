import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchAgingSignSnapshot,
  runSlaSyncForOutlet,
  SlaSyncError,
  type SlaSyncStore,
} from "./sla-cut-off-sync.service";

const record = {
  signTimelyTotal: 270,
  networkName: "SUM001A",
  signDelayOtherTotal: 0,
  signTimelyRate: "96.09%",
  queryTime: "2026-07-29",
  sendCenterTotal: 281,
  signDelayNoSignTotal: 11,
};

function createStore() {
  let existing: { id: string } | null = null;
  const upserts: object[] = [];
  const audits: object[] = [];
  const store: SlaSyncStore = {
    outlet: { findFirst: vi.fn(async () => ({ code: "SUM001A" })) },
    rawSlaCutOff: {
      findUnique: vi.fn(async () => existing),
      upsert: vi.fn(async (args) => {
        upserts.push(args);
        existing = { id: "raw-1" };
        return existing;
      }),
    },
    auditLog: {
      create: vi.fn(async (args) => {
        audits.push(args);
        return args;
      }),
    },
  };
  return { store, upserts, audits };
}

const input = {
  tenantId: "tenant-1",
  outletId: "outlet-1",
  expectedNetworkName: "SUM001A",
  actor: { actorType: "SYSTEM" as const },
};

beforeEach(() => {
  vi.stubEnv("JFS_MIDDLEWARE_BASE_URL", "https://middleware.example.test");
  vi.stubEnv("JFS_MIDDLEWARE_URL", "");
});

describe("shared SLA sync", () => {
  it("uses queryTime and upserts the same snapshot idempotently", async () => {
    const state = createStore();
    const dependencies = {
      store: state.store,
      fetchSnapshot: vi.fn(async () => ({ record, attempts: 1 })),
      now: () => new Date("2026-07-29T16:40:00.000Z"),
    };
    expect((await runSlaSyncForOutlet(input, dependencies)).result).toBe("CREATED");
    expect((await runSlaSyncForOutlet(input, dependencies)).result).toBe("UPDATED");
    expect(state.upserts).toHaveLength(2);
    expect(state.upserts[0]).toMatchObject({
      where: {
        tenantId_outletId_businessDate_sourceRecordKey: {
          sourceRecordKey: "SUM001A:2026-07-29",
          businessDate: new Date("2026-07-29T00:00:00.000Z"),
        },
      },
    });
  });

  it("skips a network mismatch without writing RAW data", async () => {
    const state = createStore();
    const result = await runSlaSyncForOutlet(input, {
      store: state.store,
      fetchSnapshot: async () => ({
        record: { ...record, networkName: "SUM002A" },
        attempts: 1,
      }),
      now: () => new Date("2026-07-29T16:40:00.000Z"),
    });
    expect(result).toMatchObject({ result: "SKIPPED", reason: "NETWORK_MISMATCH" });
    expect(state.upserts).toHaveLength(0);
  });

  it("skips a stale cron snapshot", async () => {
    const state = createStore();
    const result = await runSlaSyncForOutlet(
      { ...input, requireCurrentJakartaDate: true },
      {
        store: state.store,
        fetchSnapshot: async () => ({ record: { ...record, queryTime: "2026-07-28" }, attempts: 1 }),
        now: () => new Date("2026-07-29T16:40:00.000Z"),
      },
    );
    expect(result.reason).toBe("STALE_SNAPSHOT");
  });

  it("uses scoped aging-sign without a legacy retry path", async () => {
    const executeScoped = vi.fn(async () => ({ data: [record] }));
    const result = await fetchAgingSignSnapshot(
      vi.fn(), vi.fn(async () => undefined), 3,
      { tenantId: "tenant-1", outletId: "outlet-1" }, executeScoped as never,
    );
    expect(result.attempts).toBe(1);
    expect(executeScoped).toHaveBeenCalledOnce();
  });

  it("fails closed when the scoped operation fails", async () => {
    const executeScoped = vi.fn(async () => { throw new Error("SCOPED_UNAVAILABLE"); });
    await expect(fetchAgingSignSnapshot(
      vi.fn(), vi.fn(async () => undefined), 3,
      { tenantId: "tenant-1", outletId: "outlet-1" }, executeScoped as never,
    )).rejects.toThrow("SCOPED_UNAVAILABLE");
    expect(executeScoped).toHaveBeenCalledOnce();
  });

  it("rejects an invalid scoped payload without fallback", async () => {
    const executeScoped = vi.fn(async () => ({ data: [] }));
    await expect(fetchAgingSignSnapshot(
      vi.fn(), vi.fn(async () => undefined), 3,
      { tenantId: "tenant-1", outletId: "outlet-1" }, executeScoped as never,
    )).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(executeScoped).toHaveBeenCalledOnce();
  });

  it("fails closed without a configured middleware URL", async () => {
    vi.stubEnv("JFS_MIDDLEWARE_BASE_URL", "");
    const fetcher = vi.fn();
    await expect(fetchAgingSignSnapshot(fetcher)).rejects.toMatchObject({ retryable: false });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
