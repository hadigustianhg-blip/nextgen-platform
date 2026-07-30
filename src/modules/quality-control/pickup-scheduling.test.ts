import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const memory = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  stored: new Map<string, { id: string }>(),
  audits: [] as unknown[],
}));
const db = vi.hoisted(() => {
  const tx = {
    rawPickupSchedule: {
      findUnique: vi.fn(async ({ where }) => {
        const key = JSON.stringify(where.tenantId_outletId_businessDate_sourceRecordKey);
        return memory.stored.get(key) || null;
      }),
      upsert: vi.fn(async ({ where }) => {
        const key = JSON.stringify(where.tenantId_outletId_businessDate_sourceRecordKey);
        const row = { id: `row-${memory.stored.size + 1}` };
        memory.stored.set(key, row);
        return row;
      }),
    },
    auditLog: { create: vi.fn(async ({ data }) => { memory.audits.push(data); return data; }) },
  };
  return {
    rawPickupSchedule: { findMany: vi.fn(async () => memory.rows) },
    auditLog: tx.auditLog,
    $transaction: vi.fn(async (callback) => callback(tx)),
  };
});
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import {
  canReadPickupScheduling,
  canSyncPickupScheduling,
  canViewPickupSchedulingSensitive,
} from "./pickup-scheduling.authorization";
import {
  groupPickupSchedules,
  pickupGroupingKey,
} from "./pickup-scheduling.service";
import {
  resetPickupSchedulingLocks,
  syncPickupScheduling,
} from "./pickup-scheduling-sync.service";
import { getPickupSchedulingDetail } from "./pickup-scheduling-sensitive.service";
import {
  buildPickupMessage,
  buildPickupWhatsAppUrl,
  normalizePickupPhone,
} from "./pickup-scheduling-whatsapp";

const date = new Date("2026-07-30T00:00:00.000Z");
const row = (index: number, override: Record<string, unknown> = {}) => ({
  id: `id-${index}`, businessDate: date, sourceOrderId: `order-${index}`,
  waybillNo: `WB-${index}`, customerId: "customer-1",
  senderNameMasked: "Seller A***", senderPhoneMasked: "0812****",
  pickupAddressMasked: "Jalan ***", sourcePlatform: "TikTok",
  goodsName: `Goods ${index}`, weight: index, sourceStatus: "Created",
  sourceOutletCode: "OUT001", sourceInputTime: `2026-07-30 10:0${index}:00`,
  createdAt: new Date(`2026-07-30T10:0${index}:00.000Z`), ...override,
});
const session = (roles: string[]) => ({
  sessionId: "s", tenantId: "tenant", tenantName: "Tenant", userId: "user",
  userName: "User", email: "user@example.test", outletId: "outlet",
  outletCode: "OUT001", roles,
});

beforeEach(() => {
  vi.clearAllMocks();
  memory.rows = [];
  memory.stored.clear();
  memory.audits.length = 0;
  resetPickupSchedulingLocks();
});

describe("Pickup Scheduling grouping", () => {
  it("groups multiple waybills for the same stable customer ID and preserves order", () => {
    const groups = groupPickupSchedules([row(1), row(2)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].orders.map((order) => order.waybill)).toEqual(["WB-1", "WB-2"]);
    expect(groups[0].representativeOrderId).toBe("order-1");
  });

  it("prioritizes customer ID, then masked phone, identity, and safe name fallback", () => {
    expect(pickupGroupingKey(row(1))).toBe("customer:customer-1");
    expect(pickupGroupingKey(row(1, { customerId: null }))).toBe("phone:0812****");
    expect(pickupGroupingKey(row(1, { customerId: null, senderPhoneMasked: null })))
      .toBe("identity:seller a***|jalan ***");
    expect(pickupGroupingKey(row(1, {
      customerId: null, senderPhoneMasked: null, pickupAddressMasked: null,
    }))).toBe("name:seller a***");
  });
});

describe("Pickup Scheduling WhatsApp", () => {
  it.each([
    ["0812-3456-7890", "6281234567890"],
    ["81234567890", "6281234567890"],
    ["+62 812 3456 7890", "6281234567890"],
    ["6281234567890", "6281234567890"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizePickupPhone(input)).toBe(expected);
  });

  it("includes every waybill in order and uses a dynamic outlet", () => {
    const message = buildPickupMessage({
      customerName: "Customer", outletCode: "OUT002",
      orders: [
        { waybill: "WB-1", source: "TikTok", goodsName: "Goods 1" },
        { waybill: "WB-2", source: "Shopee", goodsName: null },
      ],
    });
    expect(message.indexOf("WB-1")).toBeLessThan(message.indexOf("WB-2"));
    expect(message).toContain("JNT CARGO OUT002");
    expect(message).not.toMatch(/undefined|null/);
    expect(buildPickupWhatsAppUrl("invalid", message)).toBeNull();
    expect(buildPickupWhatsAppUrl("081234567890", message)).toContain("https://wa.me/6281234567890?text=");
  });
});

describe("Pickup Scheduling sync and sensitive detail", () => {
  it("upserts idempotently without storing unmasked detail or raw payload", async () => {
    const record = {
      orderId: "order-1", waybillId: "WB-1", customerId: "customer-1",
      senderNameMasked: "S***", senderPhoneMasked: "081***",
      pickupAddressMasked: "Address ***", sourcePlatform: "TikTok",
      goodsName: "Goods", weight: 1, status: "Created", outletCode: "OUT001",
      networkCode: "OUT001", inputTime: "2026-07-30 10:00:00", updatedTime: null,
    };
    const first = await syncPickupScheduling({
      tenantId: "tenant", outletId: "outlet", actorId: "user", businessDate: "2026-07-30",
      fetchList: vi.fn(async () => [record]),
    });
    const second = await syncPickupScheduling({
      tenantId: "tenant", outletId: "outlet", actorId: "user", businessDate: "2026-07-30",
      fetchList: vi.fn(async () => [record]),
    });
    expect(first).toMatchObject({ created: 1, updated: 0 });
    expect(second).toMatchObject({ created: 0, updated: 1 });
    const writes = JSON.stringify(db.$transaction.mock.calls);
    expect(writes).not.toContain("customerPhone");
    expect(writes).not.toContain("pickupAddress\"");
    expect(memory.audits.at(-1)).toMatchObject({ entityType: "PICKUP_SCHEDULING_SYNC" });
  });

  it("rejects a concurrent double sync for the same tenant/outlet", async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    const first = syncPickupScheduling({
      tenantId: "tenant", outletId: "outlet", actorId: "user", businessDate: "2026-07-30",
      fetchList: vi.fn(async () => { await waiting; return []; }),
    });
    await expect(syncPickupScheduling({
      tenantId: "tenant", outletId: "outlet", actorId: "user", businessDate: "2026-07-30",
      fetchList: vi.fn(async () => []),
    })).rejects.toMatchObject({ code: "SYNC_IN_PROGRESS" });
    release();
    await first;
  });

  it("validates the representative order from scoped DB and requests exactly one detail", async () => {
    memory.rows = [row(1), row(2)];
    const fetchDetail = vi.fn(async (orderId: string) => ({
      requestedOrderId: orderId,
      customerName: "Full Customer", customerPhone: "081234567890",
      pickupAddress: "Full Address", outletCode: null,
    }));
    const group = groupPickupSchedules(memory.rows as never[])[0];
    const result = await getPickupSchedulingDetail({
      tenantId: "tenant", outletId: "outlet", actorId: "user",
      businessDate: "2026-07-30", groupId: group.groupId,
      sessionOutletCode: "SESSION01", fetchDetail,
    });
    expect(fetchDetail).toHaveBeenCalledOnce();
    expect(fetchDetail).toHaveBeenCalledWith("order-1");
    expect(result.orders.map((order) => order.waybill)).toEqual(["WB-1", "WB-2"]);
    expect(result.outletCode).toBe("OUT001");
    const calls = db.rawPickupSchedule.findMany.mock.calls as unknown as
      Array<[{ where: Record<string, unknown> }]>;
    const query = calls[0]?.[0];
    expect(query?.where).toMatchObject({
      tenantId: "tenant", outletId: "outlet",
    });
    expect(JSON.stringify(memory.audits.at(-1))).not.toMatch(/Full Customer|081234567890|Full Address/);
  });
});

describe("Pickup Scheduling UI and permissions", () => {
  it("allows VIEWER list but denies sync, detail, and WhatsApp", () => {
    expect(canReadPickupScheduling(session(["VIEWER"]))).toBe(true);
    expect(canSyncPickupScheduling(session(["VIEWER"]))).toBe(false);
    expect(canViewPickupSchedulingSensitive(session(["VIEWER"]))).toBe(false);
  });

  it("keeps accordion closed by default and detail click-only", async () => {
    const ui = await readFile(new URL("../../components/quality-control/pickup-scheduling-client.tsx", import.meta.url), "utf8");
    expect(ui).toContain("useState<Set<string>>(() => new Set())");
    expect(ui).toContain("expanded.has(group.groupId)");
    const beforeConfirm = ui.slice(0, ui.indexOf("async function confirm"));
    expect(beforeConfirm).not.toContain("/detail?");
    expect(ui).toContain('anchor.rel = "noopener noreferrer"');
    expect(ui).not.toContain("localStorage");
    expect(ui).not.toContain("sessionStorage");
  });

  it("uses private no-store detail responses and has no fixed outlet fallback", async () => {
    const route = await readFile(new URL("../../app/api/quality-control/pickup-scheduling/groups/[groupId]/detail/route.ts", import.meta.url), "utf8");
    const files = await Promise.all([
      "../../components/quality-control/pickup-scheduling-client.tsx",
      "./pickup-scheduling-whatsapp.ts",
      "./pickup-scheduling-sensitive.service.ts",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
    expect(route).toContain('"Cache-Control": "private, no-store, max-age=0"');
    expect(files.join("\n")).not.toContain("SUM001A");
  });
});
