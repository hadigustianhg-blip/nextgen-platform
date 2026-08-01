import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const memory = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  stored: new Map<string, { id: string; sourceHash: string }>(),
  audits: [] as unknown[],
}));
const db = vi.hoisted(() => {
  const tx = {
    rawPickupSchedule: {
      findUnique: vi.fn(async ({ where }) => {
        const key = JSON.stringify(where.tenantId_outletId_businessDate_sourceRecordKey);
        return memory.stored.get(key) || null;
      }),
      upsert: vi.fn(async ({ where, create, update }) => {
        const key = JSON.stringify(where.tenantId_outletId_businessDate_sourceRecordKey);
        const row = {
          id: memory.stored.get(key)?.id || `row-${memory.stored.size + 1}`,
          sourceHash: (memory.stored.has(key) ? update : create).sourceHash,
        };
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
  listPickupScheduling,
  normalizeMaskedAddress,
  normalizeMaskedPhone,
  pickupAgeLabel,
  pickupGroupingKey,
} from "./pickup-scheduling.service";
import {
  fetchPickupScheduleList,
  resetPickupSchedulingLocks,
  syncPickupScheduling,
} from "./pickup-scheduling-sync.service";
import {
  fetchPickupSenderDetail,
  getPickupSchedulingDetail,
  PickupSenderDetailError,
} from "./pickup-scheduling-sensitive.service";
import {
  buildPickupMessage,
  buildPickupWhatsAppUrl,
  normalizePickupPhone,
} from "./pickup-scheduling-whatsapp";
import { jakartaDateRange } from "@/lib/dates/jakarta-date";
import {
  pickupSchedulingQuerySchema,
  pickupSchedulingSyncSchema,
} from "./pickup-scheduling.validation";

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
  process.env.JFS_MIDDLEWARE_BASE_URL = "https://middleware.example.test";
});

describe("Pickup Scheduling date range", () => {
  it("defaults to four Jakarta calendar dates ending today", () => {
    const range = jakartaDateRange(3, new Date("2026-07-30T05:00:00.000Z"));
    expect(range).toEqual({ startDate: "2026-07-27", endDate: "2026-07-30" });
    expect(
      (Date.parse(`${range.endDate}T00:00:00.000Z`) -
        Date.parse(`${range.startDate}T00:00:00.000Z`)) /
        86_400_000 +
        1,
    ).toBe(4);
  });

  it("forwards a custom range to the list-only middleware", async () => {
    const fetcher = vi.fn(async (url: URL | RequestInfo) => {
      const parsed = url instanceof URL ? url : new URL(String(url));
      expect(parsed.searchParams.get("startDate")).toBe("2026-07-27");
      expect(parsed.searchParams.get("endDate")).toBe("2026-07-30");
      return new Response(JSON.stringify({ success: true, data: [] }));
    });
    await fetchPickupScheduleList("2026-07-27", "2026-07-30", fetcher);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("rejects reversed and ranges over 31 inclusive calendar dates", () => {
    expect(pickupSchedulingSyncSchema.safeParse({
      startDate: "2026-07-30", endDate: "2026-07-29",
    }).success).toBe(false);
    expect(pickupSchedulingQuerySchema.safeParse({
      startDate: "2026-06-01", endDate: "2026-07-02",
    }).success).toBe(false);
    expect(pickupSchedulingSyncSchema.safeParse({
      startDate: "2026-02-31", endDate: "2026-03-01",
    }).success).toBe(false);
  });

  it.each([
    ["2026-07-30", "Hari Ini"],
    ["2026-07-29", "1 Hari"],
    ["2026-07-28", "2 Hari"],
    ["2026-07-27", "3 Hari+"],
  ])("labels %s as %s", (businessDate, label) => {
    expect(pickupAgeLabel(businessDate, "2026-07-30")).toBe(label);
  });

  it("reads an inclusive range and groups the same masked contact across dates", async () => {
    memory.rows = [
      row(1, { businessDate: new Date("2026-07-27T00:00:00.000Z") }),
      row(2, { businessDate: new Date("2026-07-30T00:00:00.000Z") }),
    ];
    const result = await listPickupScheduling({
      tenantId: "tenant", outletId: "outlet",
      startDate: "2026-07-27", endDate: "2026-07-30",
      waybill: "", senderName: "", sourcePlatform: "", page: 1, pageSize: 20,
    });
    expect(result.groups).toHaveLength(1);
    expect(result.summary).toMatchObject({ totalWaybills: 2, totalGroups: 1 });
    const calls = db.rawPickupSchedule.findMany.mock.calls as unknown as
      Array<[{ where: Record<string, unknown> }]>;
    expect(calls[0][0].where).toMatchObject({
      tenantId: "tenant", outletId: "outlet",
      businessDate: {
        gte: new Date("2026-07-27T00:00:00.000Z"),
        lte: new Date("2026-07-30T00:00:00.000Z"),
      },
    });
  });

  it("calculates total groups from both masked phone and address", async () => {
    memory.rows = [
      row(1),
      row(2, { customerId: "customer-1", pickupAddressMasked: "Different ***" }),
    ];
    const result = await listPickupScheduling({
      tenantId: "tenant", outletId: "outlet",
      startDate: "2026-07-27", endDate: "2026-07-30",
      waybill: "", senderName: "", sourcePlatform: "", page: 1, pageSize: 20,
    });
    expect(result.summary).toMatchObject({ totalWaybills: 2, totalGroups: 2 });
  });
});

describe("Pickup Scheduling grouping", () => {
  it("groups equal masked phone and address and preserves order", () => {
    const groups = groupPickupSchedules([row(1), row(2)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].orders.map((order) => order.waybill)).toEqual(["WB-1", "WB-2"]);
    expect(groups[0].representativeOrderId).toBe("order-1");
  });

  it("keeps equal phones with different addresses in separate groups", () => {
    expect(groupPickupSchedules([
      row(1), row(2, { pickupAddressMasked: "Alamat lain ***" }),
    ])).toHaveLength(2);
  });

  it("keeps equal addresses with different phones in separate groups", () => {
    expect(groupPickupSchedules([
      row(1), row(2, { senderPhoneMasked: "0899****" }),
    ])).toHaveLength(2);
  });

  it("does not group by equal customer name or customer ID", () => {
    expect(groupPickupSchedules([
      row(1),
      row(2, {
        customerId: "customer-1",
        senderNameMasked: "Seller A***",
        senderPhoneMasked: "0899****",
        pickupAddressMasked: "Alamat lain ***",
      }),
    ])).toHaveLength(2);
  });

  it.each([
    { senderPhoneMasked: null },
    { pickupAddressMasked: null },
    { senderPhoneMasked: null, pickupAddressMasked: null },
  ])("does not merge records when a required contact field is missing", (override) => {
    const groups = groupPickupSchedules([row(1, override), row(2, override)]);
    expect(groups).toHaveLength(2);
    expect(groups.every((group) => group.orders.length === 1)).toBe(true);
  });

  it("normalizes address case, spaces, and line breaks without changing display", () => {
    const groups = groupPickupSchedules([
      row(1, { pickupAddressMasked: "Jl. Kebonkol No. 87  RT. 01" }),
      row(2, { pickupAddressMasked: "  jl. kebonkol no. 87\nrt. 01 " }),
    ]);
    expect(normalizeMaskedAddress("  Jl. A\n  RT 01 ")).toBe("jl. a rt 01");
    expect(groups).toHaveLength(1);
    expect(groups[0].pickupAddressMasked).toBe("Jl. Kebonkol No. 87  RT. 01");
  });

  it("normalizes masked phone separators while preserving mask characters", () => {
    expect(normalizeMaskedPhone(" 62 ****-(27) ")).toBe("62****27");
    expect(pickupGroupingKey(row(1, {
      senderPhoneMasked: "62 **** 27",
      pickupAddressMasked: "Jalan A",
    }))).toContain("62****27");
  });

  it("keeps a single record as one group with one waybill", () => {
    const groups = groupPickupSchedules([row(1)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].orders).toHaveLength(1);
  });

  it("selects the first valid source order as representative", () => {
    const groups = groupPickupSchedules([
      row(1, { sourceOrderId: "" }),
      row(2, { sourceOrderId: "valid-order" }),
    ]);
    expect(groups[0].representativeOrderId).toBe("valid-order");
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

  it("keeps the existing wording, removes duplicate waybills, and encodes once", () => {
    const message = buildPickupMessage({
      customerName: "Customer", outletCode: null,
      orders: [
        { waybill: "WB-1", source: "JFS", goodsName: null },
        { waybill: "WB-1", source: "JFS", goodsName: null },
      ],
    });
    expect(message.match(/WB-1/g)).toHaveLength(1);
    expect(message).toBe("Hallo kak Customer\n\nSaya dari JNT CARGO, izin konfirmasi penjadwalan pickup :\n\nWB-1\nJFS Pickup\n\nUntuk barang diatas apa sudah ready di pickup? Jika sudah team lapangan akan segera melakukan penjemputan ke lokasi kaka.\n\nDitunggu ya kak responnya, terimakasih 🙏");
    const url = buildPickupWhatsAppUrl("081234567890", message)!;
    expect(decodeURIComponent(new URL(url).searchParams.get("text")!)).toBe(message);
    expect(message).not.toMatch(/undefined|null|\[object Object\]/);
  });

  it.each([null, "", "-", "********", "08123", "nomor tidak tersedia"])(
    "rejects invalid or placeholder phone %s",
    (value) => expect(normalizePickupPhone(value)).toBeNull(),
  );
});

describe("Pickup Scheduling sync and sensitive detail", () => {
  it("uses the current sender-detail endpoint, encoded waybill, and actual response contract", async () => {
    const fetcher = vi.fn(async (url: URL | RequestInfo) => {
      const parsed = url instanceof URL ? url : new URL(String(url));
      expect(parsed.pathname).toBe("/jfs-sender-detail");
      expect(parsed.searchParams.get("waybillNo")).toBe("WB / 1");
      return new Response(JSON.stringify({
        success: true,
        data: {
          senderName: "Full Customer",
          senderMobilePhone: "+62 812-3456-7890",
          senderCityName: "Bandung",
        },
      }), { headers: { "content-type": "application/json" } });
    });
    await expect(fetchPickupSenderDetail(" WB / 1 ", fetcher)).resolves.toEqual({
      waybill: "WB / 1",
      senderName: "Full Customer",
      senderMobilePhone: "+62 812-3456-7890",
      senderCityName: "Bandung",
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([
    [404, "SENDER_DETAIL_NOT_FOUND"],
    [500, "SENDER_DETAIL_FAILED"],
  ])("handles sender-detail HTTP %i", async (status, expectedCode) => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      success: false,
      error: { code: expectedCode },
    }), { status, headers: { "content-type": "application/json" } }));
    await expect(fetchPickupSenderDetail("WB-1", fetcher)).rejects.toMatchObject({
      code: expectedCode,
      status,
    });
  });

  it("handles null data and invalid JSON safely", async () => {
    const nullFetcher = vi.fn(async () => new Response(JSON.stringify({ success: true, data: null }), {
      headers: { "content-type": "application/json" },
    }));
    await expect(fetchPickupSenderDetail("WB-1", nullFetcher)).rejects.toMatchObject({
      code: "SENDER_DETAIL_FAILED",
    });
    const invalidFetcher = vi.fn(async () => new Response("not-json", {
      headers: { "content-type": "application/json" },
    }));
    await expect(fetchPickupSenderDetail("WB-1", invalidFetcher)).rejects.toMatchObject({
      code: "SENDER_DETAIL_FAILED",
    });
  });

  it("retries one transient failure but does not retry a 404", async () => {
    const transient = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: { senderName: "A", senderMobilePhone: "081234567890", senderCityName: "B" },
      }), { headers: { "content-type": "application/json" } }));
    await expect(fetchPickupSenderDetail("WB-1", transient)).resolves.toMatchObject({ senderName: "A" });
    expect(transient).toHaveBeenCalledTimes(2);
    const notFound = vi.fn(async () => new Response("", { status: 404 }));
    await expect(fetchPickupSenderDetail("WB-1", notFound)).rejects.toBeInstanceOf(PickupSenderDetailError);
    expect(notFound).toHaveBeenCalledOnce();
  });

  it("upserts idempotently without storing unmasked detail or raw payload", async () => {
    const record = {
      orderId: "order-1", waybillId: "WB-1", customerId: "customer-1",
      senderNameMasked: "S***", senderPhoneMasked: "081***",
      pickupAddressMasked: "Address ***", sourcePlatform: "TikTok",
      goodsName: "Goods", weight: 1, status: "Created", outletCode: "OUT001",
      networkCode: "OUT001", inputTime: "2026-07-29 10:00:00", updatedTime: null,
      businessDate: "2026-07-29",
    };
    const first = await syncPickupScheduling({
      tenantId: "tenant", outletId: "outlet", actorId: "user",
      startDate: "2026-07-27", endDate: "2026-07-30",
      fetchList: vi.fn(async () => [record]),
    });
    const second = await syncPickupScheduling({
      tenantId: "tenant", outletId: "outlet", actorId: "user",
      startDate: "2026-07-27", endDate: "2026-07-30",
      fetchList: vi.fn(async () => [record]),
    });
    expect(first).toMatchObject({ created: 1, updated: 0 });
    expect(second).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
    expect([...memory.stored.keys()].join("\n")).toContain("2026-07-29T00:00:00.000Z");
    const writes = JSON.stringify(db.$transaction.mock.calls);
    expect(writes).not.toContain("customerPhone");
    expect(writes).not.toContain("pickupAddress\"");
    expect(memory.audits.at(-1)).toMatchObject({ entityType: "PICKUP_SCHEDULING_SYNC" });
    expect(memory.audits.at(-1)).toMatchObject({
      metadata: {
        startDate: "2026-07-27", endDate: "2026-07-30",
        fetched: 1, created: 0, updated: 0, unchanged: 1, result: "SUCCESS",
      },
    });
  });

  it("rejects a concurrent double sync for the same tenant/outlet", async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    const first = syncPickupScheduling({
      tenantId: "tenant", outletId: "outlet", actorId: "user",
      startDate: "2026-07-27", endDate: "2026-07-30",
      fetchList: vi.fn(async () => { await waiting; return []; }),
    });
    await expect(syncPickupScheduling({
      tenantId: "tenant", outletId: "outlet", actorId: "user",
      startDate: "2026-07-27", endDate: "2026-07-30",
      fetchList: vi.fn(async () => []),
    })).rejects.toMatchObject({ code: "SYNC_IN_PROGRESS" });
    release();
    await first;
  });

  it("validates the scoped group and resolves every unique waybill independently", async () => {
    memory.rows = [row(1), row(2)];
    const fetchDetail = vi.fn(async (waybill: string) => ({
      waybill, senderName: "Full Customer", senderMobilePhone: "081234567890",
      senderCityName: "Bandung",
    }));
    const group = groupPickupSchedules(memory.rows as never[])[0];
    const result = await getPickupSchedulingDetail({
      tenantId: "tenant", outletId: "outlet", actorId: "user",
      startDate: "2026-07-27", endDate: "2026-07-30", groupId: group.groupId,
      sessionOutletCode: "SESSION01", fetchDetail,
    });
    expect(fetchDetail).toHaveBeenCalledTimes(2);
    expect(fetchDetail).toHaveBeenNthCalledWith(1, "WB-1");
    expect(fetchDetail).toHaveBeenNthCalledWith(2, "WB-2");
    expect(result.orders.map((order) => order.waybill)).toEqual(["WB-1", "WB-2"]);
    expect(result.outletCode).toBe("OUT001");
    expect(result.senderMobilePhone).toBe("081234567890");
    expect(result.details.every((detail) => detail.status === "success")).toBe(true);
    const calls = db.rawPickupSchedule.findMany.mock.calls as unknown as
      Array<[{ where: Record<string, unknown> }]>;
    const query = calls[0]?.[0];
    expect(query?.where).toMatchObject({
      tenantId: "tenant", outletId: "outlet",
    });
    expect(JSON.stringify(memory.audits.at(-1))).not.toMatch(/Full Customer|081234567890|Bandung/);
  });

  it("keeps successful waybill detail when another waybill fails and uses valid list fallback", async () => {
    memory.rows = [
      row(1, { senderPhoneMasked: "081234567890" }),
      row(2, { senderPhoneMasked: "081234567890" }),
    ];
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const group = groupPickupSchedules(memory.rows as never[])[0];
    const result = await getPickupSchedulingDetail({
      tenantId: "tenant", outletId: "outlet", actorId: "user",
      startDate: "2026-07-27", endDate: "2026-07-30", groupId: group.groupId,
      sessionOutletCode: "SESSION01",
      fetchDetail: vi.fn(async (waybill: string) => {
        if (waybill === "WB-2") throw new PickupSenderDetailError("UPSTREAM", 502, "application/json", ["error"]);
        return { waybill, senderName: "Sender", senderMobilePhone: null, senderCityName: "Bandung" };
      }),
      requestId: "request-safe",
    });
    expect(result.details.map(({ waybill, status }) => ({ waybill, status }))).toEqual([
      { waybill: "WB-1", status: "success" },
      { waybill: "WB-2", status: "failed" },
    ]);
    expect(result.senderMobilePhone).toBe("081234567890");
    expect(warning).toHaveBeenCalledWith("PICKUP_SCHEDULING_SENDER_DETAIL_FAILED", expect.objectContaining({
      requestId: "request-safe", stage: "FETCH_SENDER_DETAIL", errorCode: "UPSTREAM",
    }));
  });
});

describe("Pickup Scheduling UI and permissions", () => {
  it("allows VIEWER list but denies sync, detail, and WhatsApp", () => {
    expect(canReadPickupScheduling(session(["VIEWER"]))).toBe(true);
    expect(canSyncPickupScheduling(session(["VIEWER"]))).toBe(false);
    expect(canViewPickupSchedulingSensitive(session(["VIEWER"]))).toBe(false);
  });

  it("keeps accordion closed by default and loads detail through the internal API", async () => {
    const ui = await readFile(new URL("../../components/quality-control/pickup-scheduling-client.tsx", import.meta.url), "utf8");
    expect(ui).toContain("useState<Set<string>>(() => new Set())");
    expect(ui).toContain("expanded.has(group.groupId)");
    expect(ui).toContain("loadGroupDetail(group)");
    expect(ui).toContain("detailRequests.current");
    expect(ui).toContain("confirmationLocks.current");
    expect(ui).toContain('aria-label="Tanggal Mulai"');
    expect(ui).toContain('aria-label="Tanggal Akhir"');
    expect(ui).toContain("jakartaDateRange(3)");
    expect(ui).toContain("JSON.stringify({ startDate, endDate })");
    expect(ui).toContain('onClick={() => void load()}');
    expect(ui).toContain("ageLabel");
    expect(ui).toContain('anchor.rel = "noopener noreferrer"');
    expect(ui).not.toContain("localStorage");
    expect(ui).not.toContain("sessionStorage");
    expect(ui).not.toContain("jfs-middleware-v2-production");
    expect(ui).not.toContain("/jfs-sender-detail");
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
