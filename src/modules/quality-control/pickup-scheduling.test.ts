import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const memory = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, stored: new Map<string, { id: string; sourceHash: string }>(), audits: [] as unknown[] }));
const executeScoped = vi.hoisted(() => vi.fn());
vi.mock("@/modules/integrations/jfs-multi-outlet-client", () => ({ executeTrustedMultiOutletScraper: executeScoped }));
const db = vi.hoisted(() => {
  const tx = {
    rawPickupSchedule: {
      findUnique: vi.fn(async ({ where }) => memory.stored.get(JSON.stringify(where.tenantId_outletId_sourceProvider_externalJfsId)) || null),
      upsert: vi.fn(async ({ where, create, update }) => {
        const key = JSON.stringify(where.tenantId_outletId_sourceProvider_externalJfsId);
        const row = { id: memory.stored.get(key)?.id || `row-${memory.stored.size + 1}`, sourceHash: (memory.stored.has(key) ? update : create).sourceHash };
        memory.stored.set(key, row); return row;
      }),
    },
    auditLog: { create: vi.fn(async ({ data }) => { memory.audits.push(data); return data; }) },
  };
  return { rawPickupSchedule: { findMany: vi.fn(async () => memory.rows) }, auditLog: tx.auditLog,
    $transaction: vi.fn(async (callback) => callback(tx)) };
});
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import { canReadPickupScheduling, canSyncPickupScheduling, canViewPickupSchedulingSensitive } from "./pickup-scheduling.authorization";
import { comparePickupScheduleLatest, groupPickupSchedules, isPickupAssigned, isPickupFailed,
  listPickupScheduling, projectLatestPickupSchedules } from "./pickup-scheduling.service";
import { fetchPickupScheduleList, normalizePickupScheduleRecord, PICKUP_SCHEDULING_PROVIDER,
  resetPickupSchedulingLocks, syncPickupScheduling } from "./pickup-scheduling-sync.service";
import { fetchPickupSenderDetail, getPickupSchedulingDetail, PickupSenderDetailError } from "./pickup-scheduling-sensitive.service";
import { buildPickupMessage, normalizePickupPhone } from "./pickup-scheduling-whatsapp";
import { pickupSchedulingQuerySchema } from "./pickup-scheduling.validation";

const date = new Date("2026-08-22T00:00:00.000Z");
const row = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, businessDate: date, sourceOrderId: id, externalJfsId: id.replace(/\D/g, "") || "1",
  waybillNo: `WB-${id}`, customerId: "C1", customerName: "Customer",
  senderNameMasked: "Sender ***", senderPhoneMasked: "081***", pickupAddressMasked: "Jalan ***",
  senderCompany: null, senderCityName: "Bandung", senderAreaName: "Cicendo",
  sourcePlatform: "Marketplace", goodsName: "Barang", weight: 1, sourceStatus: "Dijadwalkan",
  orderStatusCode: 101, sourceOutletCode: "SUM001A", sourceNetworkCode: "SUM001A",
  pickNetworkName: "SUMEDANG", pickStaffName: null, pickStaffCode: null, sendName: "Jemput Paket",
  pickFailReason: null, pickFailAt: null, pickFailTimes: 0,
  sourceInputAt: new Date("2026-08-22T01:00:00.000Z"), sourceUpdatedAt: new Date("2026-08-22T02:00:00.000Z"),
  bestPickTimeStartAt: null, bestPickTimeEndAt: null, sourceProvider: PICKUP_SCHEDULING_PROVIDER,
  createdAt: new Date("2026-08-22T02:00:00.000Z"), ...overrides,
});
const raw = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, waybillId: `WB-${id}`, inputTime: "2026-08-22 08:00:00", updateTime: "2026-08-22 09:00:00",
  orderSourceName: "Marketplace", orderStatusCode: "101", orderStatusName: "Outlet dijadwalkan",
  senderName: "A***", senderMobilePhone: "0812****789", senderDetailedAddress: "Jalan ***",
  packageTotalWeight: "2.5", pickNetworkCode: "SUM001A", ...overrides,
});

beforeEach(() => { vi.clearAllMocks(); memory.rows = []; memory.stored.clear(); memory.audits.length = 0; resetPickupSchedulingLocks(); });

describe("OMS scheduling ingestion", () => {
  it("uses the new scoped operation and sends no sendCode", async () => {
    executeScoped.mockResolvedValue({ records: [raw("101")], pagesFetched: 2 });
    const result = await fetchPickupScheduleList("2026-08-22", "2026-08-22", fetch, { tenantId: "tenant", outletId: "outlet" });
    expect(executeScoped).toHaveBeenCalledWith({ tenantId: "tenant", outletId: "outlet" }, "OMS_SCHEDULING_LIST",
      expect.objectContaining({ startInputTime: "2026-08-22 00:00:00", endInputTime: "2026-08-22 23:59:59", timeType: 1, pageSize: 100 }));
    expect(executeScoped.mock.calls[0]![2]).not.toHaveProperty("sendCode");
    expect(result).toMatchObject({ fetched: 1, invalid: 0, pagesFetched: 2 });
  });

  it.each(["drop-off", "Jemput Paket"])("retains send method %s", (sendName) => {
    expect(normalizePickupScheduleRecord(raw("1", { sendName }))?.sendName).toBe(sendName);
  });

  it("retains statuses, assignment, failure, network, and safely parses optional values", () => {
    const normalized = normalizePickupScheduleRecord(raw("1", { orderStatusCode: "102", pickStaffCode: "S1",
      pickFailReason: "Alamat tutup", pickFailTimes: "2", packageChargeWeight: "bad", customerOrderTime: "bad" }));
    expect(normalized).toMatchObject({ externalJfsId: "1", orderStatusCode: 102, pickStaffCode: "S1",
      pickFailReason: "Alamat tutup", pickFailTimes: 2, packageChargeWeight: null, customerOrderAt: null,
      sourceNetworkCode: "SUM001A" });
  });

  it("skips malformed required identity and strips unexpected clear phone from persisted raw payload", () => {
    expect(normalizePickupScheduleRecord(raw("bad"))).toBeNull();
    const normalized = normalizePickupScheduleRecord(raw("1", { senderMobilePhone: "081234567890" }));
    expect(normalized?.senderPhoneMasked).toBeNull();
    expect(normalized?.rawPayload.senderMobilePhone).toBeNull();
  });

  it("upserts by scoped provider plus external ID and keeps distinct IDs", async () => {
    const source = { records: [normalizePickupScheduleRecord(raw("1"))!, normalizePickupScheduleRecord(raw("2"))!], fetched: 2, invalid: 0, pagesFetched: 1 };
    const first = await syncPickupScheduling({ tenantId: "tenant", outletId: "outlet", actorId: "actor",
      startDate: "2026-08-22", endDate: "2026-08-22", fetchList: vi.fn(async () => source) });
    const second = await syncPickupScheduling({ tenantId: "tenant", outletId: "outlet", actorId: "actor",
      startDate: "2026-08-22", endDate: "2026-08-22", fetchList: vi.fn(async () => source) });
    expect(first).toMatchObject({ inserted: 2, updated: 0, operationalWaybills: 2 });
    expect(second).toMatchObject({ inserted: 0, unchanged: 2 });
    expect(memory.stored.size).toBe(2);
    expect([...memory.stored.keys()].join("\n")).toContain(PICKUP_SCHEDULING_PROVIDER);
  });
});

describe("latest-per-waybill projection and filters", () => {
  it("uses update time, input time, then external ID deterministically without deleting raw rows", () => {
    const rows = [row("1", { waybillNo: "SAME", sourceUpdatedAt: null, sourceInputAt: date, externalJfsId: "1" }),
      row("2", { waybillNo: "SAME", sourceUpdatedAt: null, sourceInputAt: date, externalJfsId: "2" }),
      row("3", { waybillNo: "OTHER", sourceUpdatedAt: new Date("2026-08-22T03:00:00Z") })];
    expect(projectLatestPickupSchedules(rows as never[]).map(item => item.id)).toEqual(["2", "3"]);
    expect(rows).toHaveLength(3);
    expect(comparePickupScheduleLatest(rows[1] as never, rows[0] as never)).toBeLessThan(0);
  });

  it("derives assignment and failure only from explicit fields", () => {
    expect(isPickupAssigned(row("1", { pickStaffName: "Kurir" }) as never)).toBe(true);
    expect(isPickupAssigned(row("1", { sourceStatus: "sprinter dijadwalkan" }) as never)).toBe(false);
    expect(isPickupFailed(row("1", { pickFailTimes: 1 }) as never)).toBe(true);
    expect(isPickupFailed(row("1") as never)).toBe(false);
  });

  it("filters persisted projection across every supported dimension", async () => {
    memory.rows = [row("1", { waybillNo: "WB-TARGET", sourcePlatform: "API", sourceStatus: "Scheduled",
      orderStatusCode: 102, sendName: "Jemput Paket", pickNetworkName: "Bandung", pickStaffName: "Budi",
      senderCityName: "Bandung", senderAreaName: "Cicendo", pickFailReason: "Tutup" })];
    const parsed = pickupSchedulingQuerySchema.parse({ startDate: "2026-08-22", endDate: "2026-08-22",
      waybill: "target", senderName: "customer", sourcePlatform: "api", orderStatus: "102", sendName: "jemput",
      pickupNetwork: "bandung", pickupStaff: "budi", assignment: "ASSIGNED", pickupFailure: "FAILED",
      senderCity: "bandung", senderArea: "cicendo" });
    const result = await listPickupScheduling({ tenantId: "tenant", outletId: "outlet", ...parsed });
    expect(result.summary.totalWaybills).toBe(1);
    expect(db.rawPickupSchedule.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant", outletId: "outlet" }) }));
  });
});

describe("just-in-time WhatsApp detail", () => {
  it("invokes scoped detail by external ID and preserves exact existing message", async () => {
    const execute = vi.fn(async () => ({ id: "123", waybillId: "WB-123", senderName: "Customer",
      senderMobilePhone: "(+62)816700535", senderCityName: "Bandung" }));
    await expect(fetchPickupSenderDetail("123", { tenantId: "tenant", outletId: "outlet" }, execute as never))
      .resolves.toMatchObject({ externalJfsId: "123", waybill: "WB-123" });
    expect(execute).toHaveBeenCalledWith({ tenantId: "tenant", outletId: "outlet" }, "OMS_SCHEDULING_DETAIL", { externalJfsId: "123" });
    expect(normalizePickupPhone("(+62)816700535")).toBe("62816700535");
    expect(buildPickupMessage({ customerName: "A", outletCode: "OUT", orders: [{ waybill: "WB", source: "JFS", goodsName: "Barang" }] }))
      .toContain("izin konfirmasi penjadwalan pickup");
  });

  it.each(["0812****789", "", "phone081234567890"])("rejects masked/malformed phone %s", value => {
    expect(normalizePickupPhone(value)).toBeNull();
  });

  it("validates scoped external ID and waybill with no masked fallback or phone logging", async () => {
    memory.rows = [row("123", { waybillNo: "WB-123", senderPhoneMasked: "0812****789" })];
    const group = groupPickupSchedules(memory.rows as never[])[0]!;
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(getPickupSchedulingDetail({ tenantId: "tenant", outletId: "outlet", actorId: "actor",
      startDate: "2026-08-22", endDate: "2026-08-22", groupId: group.groupId, sessionOutletCode: "DEV001",
      fetchDetail: vi.fn(async () => ({ externalJfsId: "999", waybill: "WB-OTHER", senderName: null,
        senderMobilePhone: "081234567890", senderCityName: null })) })).rejects.toMatchObject({ code: "DETAIL_IDENTITY_MISMATCH" });
    expect(JSON.stringify(warning.mock.calls)).not.toContain("081234567890");
    expect(JSON.stringify(memory.audits)).not.toContain("081234567890");
  });

  it("returns clear phone ephemerally only after identity validation", async () => {
    memory.rows = [row("123", { waybillNo: "WB-123" })];
    const group = groupPickupSchedules(memory.rows as never[])[0]!;
    const result = await getPickupSchedulingDetail({ tenantId: "tenant", outletId: "outlet", actorId: "actor",
      startDate: "2026-08-22", endDate: "2026-08-22", groupId: group.groupId, sessionOutletCode: "DEV001",
      fetchDetail: vi.fn(async () => ({ externalJfsId: "123", waybill: "WB-123", senderName: "A",
        senderMobilePhone: "0816700535", senderCityName: "Bandung" })) });
    expect(result.senderMobilePhone).toBe("0816700535");
    expect(memory.audits.at(-1)).toMatchObject({ metadata: expect.objectContaining({ event: "WA_CONFIRMATION_OPENED", waybill: "WB-123" }) });
    expect(JSON.stringify(memory.audits)).not.toContain("0816700535");
  });
});

describe("permissions and presentation safety", () => {
  const session = (roles: string[]) => ({ roles } as never);
  it("allows read separately from manage/sensitive permission", () => {
    expect(canReadPickupScheduling(session(["VIEWER"]))).toBe(true);
    expect(canSyncPickupScheduling(session(["VIEWER"]))).toBe(false);
    expect(canViewPickupSchedulingSensitive(session(["VIEWER"]))).toBe(false);
  });
  it("does not fetch sensitive detail on normal row expansion", async () => {
    const ui = await readFile(new URL("../../components/quality-control/pickup-scheduling-client.tsx", import.meta.url), "utf8");
    expect(ui).not.toContain("jfs-sender-detail");
    expect(ui).not.toContain("SUM001A");
    expect(ui).not.toContain("void loadGroupDetail(group).catch");
  });
});
