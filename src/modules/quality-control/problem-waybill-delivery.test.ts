import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  rawDispatch: {
    count: vi.fn(),
    groupBy: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  auditLog: { create: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import {
  canReadProblemWaybill,
  canViewProblemWaybillSensitive,
} from "./problem-waybill-delivery.authorization";
import {
  fetchSensitiveDetail,
  getProblemWaybillSensitiveDetail,
  normalizeSensitiveDetail,
} from "./problem-waybill-delivery-sensitive.service";
import {
  listProblemWaybillDelivery,
  maskReceiverName,
} from "./problem-waybill-delivery.service";
import {
  buildProblemWaybillWhatsAppUrl,
  normalizeIndonesianPhone,
} from "./problem-waybill-delivery-whatsapp";
import {
  checkProblemWaybillSensitiveRateLimit,
  resetProblemWaybillSensitiveRateLimit,
} from "./problem-waybill-delivery-rate-limit";

const session = (roles: string[]) => ({
  sessionId: "session-1", email: "user@example.test",
  userId: "user-1", userName: "User", tenantId: "tenant-1", tenantName: "Tenant",
  outletId: "outlet-1", outletCode: "SUM001A", roles,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.rawDispatch.count.mockResolvedValue(2);
  db.rawDispatch.groupBy.mockResolvedValue([
    { courierNameRaw: "Courier A", _count: { _all: 1 } },
    { courierNameRaw: "Courier B", _count: { _all: 1 } },
  ]);
  db.rawDispatch.findMany.mockResolvedValue([
    {
      id: "raw-1", operationalDate: new Date("2026-07-29T00:00:00.000Z"),
      waybillNo: "WB000001", courierNameRaw: "Courier A",
      deliveryStatusRaw: "Belum Diterima", receiverName: "Penerima Rahasia",
      updatedAt: new Date("2026-07-29T12:00:00.000Z"),
    },
  ]);
});

describe("Problem Waybill Delivery list", () => {
  it("scopes pending RAW_DISPATCH by tenant/outlet and paginates after summary", async () => {
    const result = await listProblemWaybillDelivery({
      tenantId: "tenant-1", outletId: "outlet-1", businessDate: "2026-07-29",
      waybill: "WB", courierName: "Courier", page: 2, pageSize: 20,
      sortBy: "businessDate", sortOrder: "desc",
    });
    const where = db.rawDispatch.count.mock.calls[0][0].where;
    expect(where).toMatchObject({
      tenantId: "tenant-1", outletId: "outlet-1",
      deliveryStatusRaw: { equals: "Belum Diterima", mode: "insensitive" },
      waybillNo: { contains: "WB", mode: "insensitive" },
      courierNameRaw: { contains: "Courier", mode: "insensitive" },
    });
    expect(db.rawDispatch.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }));
    expect(result.summary).toEqual({ totalBelumDiterima: 2, totalWaybill: 2, totalCourier: 2 });
    expect(result.pagination).toMatchObject({ page: 2, total: 2 });
    expect(result.data[0].receiverNameMasked).not.toContain("Rahasia");
  });

  it("masks receiver names without inventing absent values", () => {
    expect(maskReceiverName("Budi Santoso")).toBe("B*** S******");
    expect(maskReceiverName(null)).toBeNull();
  });
});

describe("Problem Waybill sensitive detail", () => {
  it("maps only audited fields and returns unavailable fields as null", () => {
    expect(normalizeSensitiveDetail({
      waybillNo: "WB000001", receiverName: "Receiver",
      receiverMobilePhone: "081234567890", receiverDetailedAddress: "Address",
      updateTime: "2026-07-29 10:00:00", abnormalName: "Kendala",
    }, { waybill: "WB000001", currentStatus: "Belum Diterima" })).toEqual({
      waybill: "WB000001", receiverName: "Receiver", receiverPhone: "081234567890",
      receiverAddress: "Address", senderName: null, senderPhone: null,
      lastScanSite: null, lastScanTime: "2026-07-29 10:00:00",
      currentStatus: "Belum Diterima", problemReason: "Kendala",
    });
  });

  it("retries 5xx once and does not retry 4xx", async () => {
    const good = new Response(JSON.stringify({ success: true, data: { waybillNo: "WB000001" } }), { status: 200 });
    const retryFetcher = vi.fn()
      .mockResolvedValueOnce(new Response("error", { status: 500 }))
      .mockResolvedValueOnce(good);
    await fetchSensitiveDetail("WB000001", { fetcher: retryFetcher, wait: vi.fn(async () => undefined) });
    expect(retryFetcher).toHaveBeenCalledTimes(2);
    const noRetry = vi.fn(async () => new Response("not found", { status: 404 }));
    await expect(fetchSensitiveDetail("WB000001", { fetcher: noRetry })).rejects.toMatchObject({ retryable: false });
    expect(noRetry).toHaveBeenCalledOnce();
  });

  it("rejects missing, foreign-scoped, or non-pending waybills before fetch", async () => {
    db.rawDispatch.findFirst.mockResolvedValueOnce(null);
    const fetcher = vi.fn();
    await expect(getProblemWaybillSensitiveDetail({
      tenantId: "tenant-1", outletId: "outlet-1", actorId: "user-1",
      waybill: "WB000001", fetcher,
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
    db.rawDispatch.findFirst.mockResolvedValueOnce({ waybillNo: "WB000001", deliveryStatusRaw: "Penerimaan Normal" });
    await expect(getProblemWaybillSensitiveDetail({
      tenantId: "tenant-1", outletId: "outlet-1", actorId: "user-1",
      waybill: "WB000001", fetcher,
    })).rejects.toMatchObject({ code: "STATUS_CHANGED" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(db.rawDispatch.findFirst.mock.calls[0][0].where).toMatchObject({
      tenantId: "tenant-1", outletId: "outlet-1", waybillNo: "WB000001",
    });
  });

  it("audits only scope, waybill, and result—not personal data", async () => {
    db.rawDispatch.findFirst.mockResolvedValue({ waybillNo: "WB000001", deliveryStatusRaw: "Belum Diterima" });
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      success: true, data: { waybillNo: "WB000001", receiverName: "Private", receiverMobilePhone: "081234567890" },
    }), { status: 200 }));
    await getProblemWaybillSensitiveDetail({
      tenantId: "tenant-1", outletId: "outlet-1", actorId: "user-1",
      waybill: "WB000001", fetcher,
    });
    const serialized = JSON.stringify(db.auditLog.create.mock.calls[0][0]);
    expect(serialized).toContain("PROBLEM_WAYBILL_SENSITIVE_VIEW");
    expect(serialized).not.toContain("Private");
    expect(serialized).not.toContain("081234567890");
  });
});

describe("Problem Waybill permissions and WhatsApp", () => {
  it("allows VIEWER list but restricts sensitive detail", () => {
    expect(canReadProblemWaybill(session(["VIEWER"]))).toBe(true);
    expect(canViewProblemWaybillSensitive(session(["VIEWER"]))).toBe(false);
    for (const role of ["OWNER", "ADMIN", "OPERATIONAL"]) {
      expect(canViewProblemWaybillSensitive(session([role]))).toBe(true);
    }
  });

  it.each([
    ["081234567890", "6281234567890"],
    ["81234567890", "6281234567890"],
    ["+6281234567890", "6281234567890"],
    ["62 812-3456-7890", "6281234567890"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeIndonesianPhone(input)).toBe(expected);
  });

  it("rejects invalid phone and encodes the complete template", () => {
    expect(normalizeIndonesianPhone("abc")).toBeNull();
    expect(buildProblemWaybillWhatsAppUrl({
      receiverName: null, receiverPhone: "invalid", waybill: "WB000001",
    })).toBeNull();
    const url = buildProblemWaybillWhatsAppUrl({
      receiverName: "Budi", receiverPhone: "081234567890", waybill: "WB000001",
    });
    expect(url).toContain("https://wa.me/6281234567890?text=");
    expect(decodeURIComponent(url!.split("?text=")[1])).toContain("WB000001");
  });

  it("keeps sensitive fetch click-only, clears modal, and uses the shared dispatch sync", async () => {
    const ui = await readFile(
      new URL("../../components/quality-control/problem-waybill-delivery-client.tsx", import.meta.url),
      "utf8",
    );
    expect(ui).toContain("openDetail(row.waybill)");
    expect(ui.slice(0, ui.indexOf("async function openDetail"))).not.toContain(
      "/detail",
    );
    expect(ui).toContain("setDetail(null)");
    expect(ui).toContain("detailAbort.current?.abort()");
    expect(ui).toContain('fetch("/api/delivery-settlement/sync"');
    expect(ui).toContain("await load()");
    expect(ui).toContain('anchor.rel = "noopener noreferrer"');
  });

  it("sets no-store on every sensitive detail response and rate-limits bursts", async () => {
    const route = await readFile(
      new URL(
        "../../app/api/quality-control/problem-waybill-delivery/[waybill]/detail/route.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(route).toContain('"Cache-Control": "private, no-store, max-age=0"');
    expect(route).toContain("canViewProblemWaybillSensitive(session)");
    resetProblemWaybillSensitiveRateLimit();
    for (let index = 0; index < 10; index += 1) {
      expect(checkProblemWaybillSensitiveRateLimit("tenant:user", index)).toBe(true);
    }
    expect(checkProblemWaybillSensitiveRateLimit("tenant:user", 10)).toBe(false);
  });
});
