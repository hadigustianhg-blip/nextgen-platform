import { describe, expect, it, vi } from "vitest";
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

  it("retries network and 5xx failures", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: [record] }), { status: 200 }));
    const wait = vi.fn(async () => undefined);
    expect((await fetchAgingSignSnapshot(fetcher, wait)).attempts).toBe(2);
    expect(wait).toHaveBeenCalledOnce();
  });

  it("does not retry validation and HTTP 4xx errors", async () => {
    const fetcher = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    await expect(fetchAgingSignSnapshot(fetcher, vi.fn(async () => undefined))).rejects.toMatchObject({
      retryable: false,
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("does not retry an invalid payload", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ success: true, data: [] }), { status: 200 }));
    await expect(fetchAgingSignSnapshot(fetcher, vi.fn(async () => undefined))).rejects.toBeInstanceOf(SlaSyncError);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
