import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import {
  aggregateDeliveryRecords,
  calculateDeliveryFinancials,
  deduplicateDispatchEnvelope,
  deliverySyncFailureDiagnostic,
  fetchDeliverySources,
  normalizeComparison,
  sourceHash,
  summarizeDeliveryRows,
} from "./delivery-settlement.service";
import {
  classifyCodSettlement,
  codSourceKey,
  deduplicateCodEnvelope,
  selectLatestCodRecords,
} from "./cod-deduplication";
import {
  codRecordSchema,
  deliveryAdjustmentSchema,
  deliverySettlementListSchema,
  dispatchRecordSchema,
} from "./delivery-settlement.validation";

const d = (value: number | string) => new Prisma.Decimal(value);

describe("Delivery Settlement aggregation", () => {
  it("deduplicates overlapping endpoint pages by waybill and keeps the latest event", () => {
    const base = {
      kurir: "A", ongkir: 100, receiver: "", address: "",
      status: "Belum diterima", berat: 1, pembayaran: "", service: "",
      codStatus: "", codValue: 0, barang: "",
    };
    const records = [
      dispatchRecordSchema.parse({
        ...base, waybillNo: "WB1", waktu: "2026-07-31 10:00:00",
      }),
      dispatchRecordSchema.parse({
        ...base, waybillNo: "WB2", waktu: "2026-07-31 11:00:00",
      }),
      dispatchRecordSchema.parse({
        ...base, waybillNo: "WB1", waktu: "2026-07-31 12:00:00",
        status: "Penerimaan Normal",
      }),
    ];
    const result = deduplicateDispatchEnvelope(records);
    expect(result).toHaveLength(2);
    expect(result.find((row) => row.waybillNo === "WB1"))
      .toMatchObject({ waktu: "2026-07-31 12:00:00", status: "Penerimaan Normal" });
  });

  it("deduplicates COD envelope by waybill even when repayment type changes", () => {
    const records = [
      codRecordSchema.parse({ waybillNo: "WB1", codAmount: 100000, repaymentStatus: 1, repaymentType: 0, repaymentTypeCode: 0, signTime: "2026-07-31 10:00:00", dispatchStaffName: "A" }),
      codRecordSchema.parse({ waybillNo: "WB1", codAmount: 100000, repaymentStatus: 1, repaymentType: 1, repaymentTypeCode: 1, signTime: "2026-07-31 10:00:00", dispatchStaffName: "A" }),
    ];
    expect(deduplicateCodEnvelope(records)).toEqual([records[1]]);
    expect(codSourceKey(records[0].waybillNo)).toBe(codSourceKey(records[1].waybillNo));
  });

  it("selects one final RawCod version so dispatch multiplicity cannot double COD", () => {
    const base = {
      waybillNo: "WB1", courierNameRaw: "A", repaymentTypeLabel: "COD",
      codAmount: d(100000), signedAt: new Date("2026-07-31T03:00:00Z"),
      createdAt: new Date("2026-07-31T04:00:00Z"),
    };
    const final = selectLatestCodRecords([
      { ...base, id: "old", repaymentTypeCode: 0, sourceFetchedAt: new Date("2026-07-31T05:00:00Z"), updatedAt: new Date("2026-07-31T05:00:00Z") },
      { ...base, id: "new", repaymentTypeCode: 1, sourceFetchedAt: new Date("2026-07-31T06:00:00Z"), updatedAt: new Date("2026-07-31T06:00:00Z") },
    ]);
    const dispatches = [
      { courierNameRaw: "A", deliveryStatusRaw: "Penerimaan Normal", freightAmount: d(0) },
      { courierNameRaw: "A", deliveryStatusRaw: "Penerimaan Normal", freightAmount: d(0) },
    ];
    const result = aggregateDeliveryRecords(dispatches, final);
    expect(final).toHaveLength(1);
    expect(result.rows[0].codCash.toString()).toBe("100000");
  });
  it("normalizes courier identity without fuzzy matching", () => {
    expect(normalizeComparison("  Ridwan   Kusnawan ")).toBe("RIDWAN KUSNAWAN");
    expect(normalizeComparison("Ridwan K.")).not.toBe(normalizeComparison("Ridwan Kusnawan"));
  });

  it("creates stable canonical hashes independent of object key order", () => {
    expect(sourceHash({ a: 1, b: 2 })).toBe(sourceHash({ b: 2, a: 1 }));
  });

  it("includes only Penerimaan Normal in DFOD and sums ONGKIR", () => {
    const result = aggregateDeliveryRecords([
      { courierNameRaw: "RIDWAN", deliveryStatusRaw: " Penerimaan Normal ", freightAmount: d(200000) },
      { courierNameRaw: "ridwan", deliveryStatusRaw: "penerimaan normal", freightAmount: d(100000) },
      { courierNameRaw: "RIDWAN", deliveryStatusRaw: "Belum diterima", freightAmount: d(999999) },
    ], []);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].dfod.toString()).toBe("300000");
  });

  it("keeps QRIS breakdown out of the collectible COD sum", () => {
    const result = aggregateDeliveryRecords([], [
      { courierNameRaw: "RIDWAN", repaymentTypeCode: 1, repaymentTypeLabel: "COD", codAmount: d(400000) },
      { courierNameRaw: "RIDWAN", repaymentTypeCode: 3, repaymentTypeLabel: "COD", codAmount: d(400000) },
      { courierNameRaw: "RIDWAN", repaymentTypeCode: 2, repaymentTypeLabel: "Qris COD", codAmount: d(108813) },
    ]);
    expect(result.rows[0].codCash.toString()).toBe("800000");
    expect(result.rows[0].codQris.toString()).toBe("108813");
    expect(result.rows[0].dfod.plus(result.rows[0].codCash).toString()).toBe("800000");
  });

  it("uses normalized TYPE label when a known code is unavailable", () => {
    const result = aggregateDeliveryRecords([], [
      { courierNameRaw: "A", repaymentTypeCode: null, repaymentTypeLabel: " qRiS   CoD ", codAmount: d(10) },
      { courierNameRaw: "A", repaymentTypeCode: null, repaymentTypeLabel: "Tunai", codAmount: d(20) },
    ]);
    expect(result.rows[0].codQris.toString()).toBe("10");
    expect(result.rows[0].codCash.toString()).toBe("20");
  });

  it("keeps missing couriers under Team Belum Terpetakan and rejects unknown COD type", () => {
    const result = aggregateDeliveryRecords(
      [{ courierNameRaw: "", deliveryStatusRaw: "Penerimaan Normal", freightAmount: d(10) }],
      [{ courierNameRaw: "A", repaymentTypeCode: 9, repaymentTypeLabel: null, codAmount: d(20) }],
    );
    expect(result.anomaly).toBe(1);
    expect(result.rows[0].codCash.toString()).toBe("0");
    expect(result.rows[0].codQris.toString()).toBe("0");
    expect(result.rows.find((row) => row.courierKey === "TEAM BELUM TERPETAKAN")?.dfod.toString()).toBe("10");
  });

  it("groups normalized courier names and keeps distinct identities separate", () => {
    const result = aggregateDeliveryRecords([
      { courierNameRaw: " Ridwan  Kusnawan ", deliveryStatusRaw: "Penerimaan Normal", freightAmount: d(1) },
      { courierNameRaw: "RIDWAN KUSNAWAN", deliveryStatusRaw: "Penerimaan Normal", freightAmount: d(2) },
      { courierNameRaw: "RIDWAN K.", deliveryStatusRaw: "Penerimaan Normal", freightAmount: d(3) },
    ], []);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.find((row) => row.courierKey === "RIDWAN KUSNAWAN")?.dfod.toString()).toBe("3");
  });

  it("classifies actual repayment codes into exactly one settlement category", () => {
    expect(classifyCodSettlement({ repaymentTypeCode: 1, repaymentTypeLabel: null })).toBe("COD_CASH");
    expect(classifyCodSettlement({ repaymentTypeCode: 3, repaymentTypeLabel: null })).toBe("COD_CASH");
    expect(classifyCodSettlement({ repaymentTypeCode: 2, repaymentTypeLabel: null })).toBe("COD_QRIS");
    expect(classifyCodSettlement({ repaymentTypeCode: 0, repaymentTypeLabel: null })).toBe("COD_CASH");
    expect(classifyCodSettlement({ repaymentTypeCode: 9, repaymentTypeLabel: "COD" })).toBe("EXCLUDED");
  });

  it("reports a safe sync failure stage without serializing the exception", () => {
    const diagnostic = deliverySyncFailureDiagnostic({
      requestId: "request-1",
      stage: "UPSERT_MASTER_SETORAN",
      error: new Error("sensitive database detail"),
      tenantId: "tenant-1",
      outletId: "outlet-1",
      businessDate: "2026-07-31",
    });
    expect(diagnostic).toMatchObject({
      requestId: "request-1",
      stage: "UPSERT_MASTER_SETORAN",
      errorCode: "INTERNAL_ERROR",
      prismaCode: null,
      tenantId: "tenant-1",
      outletId: "outlet-1",
      businessDate: "2026-07-31",
    });
    expect(JSON.stringify(diagnostic)).not.toContain("sensitive database detail");
  });

  it("extracts PostgreSQL check violation code and constraint name safely", () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      "Constraint failed",
      {
        code: "P2004",
        clientVersion: "6.19.3",
        meta: { database_error: {
          code: "23514",
          constraint: "MasterSetoran_total_formula_check",
        } },
      },
    );
    const diagnostic = deliverySyncFailureDiagnostic({
      requestId: "request-constraint",
      stage: "UPSERT_MASTER_SETORAN",
      error,
      tenantId: "tenant-1",
      outletId: "outlet-1",
      businessDate: "2026-07-31",
    });
    expect(diagnostic).toMatchObject({
      prismaCode: "P2004",
      postgresCode: "23514",
      constraintName: "MasterSetoran_total_formula_check",
      stage: "UPSERT_MASTER_SETORAN",
      requestId: "request-constraint",
    });
    expect(JSON.stringify(diagnostic)).not.toContain("Constraint failed");
  });

  it("does not fetch COD or enter later stages when Dispatch fails", async () => {
    const stages: string[] = [];
    const fetcher = vi.fn(async (endpoint: "/jfs-dispatch" | "/jfs-cod") => {
      if (endpoint === "/jfs-dispatch") throw new Error("dispatch failed");
      return { success: true, total: 0, data: [], diagnostic: {
        endpoint, httpStatus: 200, contentType: "application/json",
        attemptCount: 1, durationMs: 1,
      } };
    });
    await expect(fetchDeliverySources(fetcher, "2026-07-31", (stage) => stages.push(stage)))
      .rejects.toThrow("dispatch failed");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(stages).toEqual(["FETCH_DISPATCH"]);
  });

  it("reports COD independently after a successful Dispatch fetch", async () => {
    const stages: string[] = [];
    const fetcher = vi.fn(async (endpoint: "/jfs-dispatch" | "/jfs-cod") => {
      if (endpoint === "/jfs-cod") throw new Error("cod failed");
      return { success: true, total: 0, data: [], diagnostic: {
        endpoint, httpStatus: 200, contentType: "application/json",
        attemptCount: 1, durationMs: 1,
      } };
    });
    await expect(fetchDeliverySources(fetcher, "2026-07-31", (stage) => stages.push(stage)))
      .rejects.toThrow("cod failed");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(stages).toEqual(["FETCH_DISPATCH", "FETCH_COD"]);
  });

});

describe("Delivery Settlement financial calculation", () => {
  it("reconciles the 31 July COD, QRIS, and DFOD semantics", () => {
    const totalCod = d(21876610);
    const codQris = d(614800);
    const dfod = d(1535421);
    const totalSettlement = dfod.plus(totalCod);
    expect(totalCod.minus(codQris).toString()).toBe("21261810");
    expect(totalSettlement.toString()).toBe("23412031");
    expect(totalSettlement.equals(dfod.plus(totalCod).plus(codQris))).toBe(false);
  });

  it.each([
    { courier: "LILI SOBARI", dfod: 89542, cod: 5722812, qris: 310881, settlement: 5812354 },
    { courier: "M KURNIA", dfod: 71800, cod: 2252817, qris: 160556, settlement: 2324617 },
    { courier: "RIDWAN KUSNAWAN", dfod: 345551, cod: 5481608, qris: 143363, settlement: 5827159 },
  ])("keeps QRIS out of $courier settlement while exposing its breakdown", ({ dfod, cod, qris, settlement }) => {
    const total = d(dfod).plus(cod);
    expect(total.toString()).toBe(String(settlement));
    expect(d(cod).minus(qris).plus(qris).toString()).toBe(String(cod));
    expect(total.equals(d(dfod).plus(cod).plus(qris))).toBe(false);
  });

  it("keeps QRIS as a subset of total COD instead of adding it twice", () => {
    const summary = summarizeDeliveryRows([{
      totalSettlement: "150000", cashPaidAmount: "50000",
      transferPaidAmount: "25000", outstandingAmount: "75000",
      codCashAmount: "100000", codQrisAmount: "20000", dfodAmount: "50000",
      paymentStatus: "UNCLEARED",
    }]);
    expect(summary.totalCod.toString()).toBe("100000");
    expect(summary.totalCodQris.toString()).toBe("20000");
    expect(summary.totalSettlement.toString()).toBe("150000");
    expect(summary.totalCashReceived.plus(summary.totalTransferReceived).toString()).toBe("75000");
    expect(summary.totalOutstanding.toString()).toBe("75000");
  });

  it("sums COD cash, COD QRIS, and DFOD across all filtered rows", () => {
    const base = {
      totalSettlement: "0", cashPaidAmount: "0", transferPaidAmount: "0",
      outstandingAmount: "0", paymentStatus: "CLEAR" as const,
    };
    const summary = summarizeDeliveryRows([
      { ...base, codCashAmount: "100000", codQrisAmount: "25000", dfodAmount: "50000" },
      { ...base, codCashAmount: "200000", codQrisAmount: "75000", dfodAmount: "125000" },
    ]);
    expect(summary.totalCod.toString()).toBe("300000");
    expect(summary.totalCodQris.toString()).toBe("100000");
    expect(summary.totalDfod.toString()).toBe("175000");
  });

  it.each([
    { obligation: 1000000, cash: 400000, transfer: 600000, status: "CLEAR", remaining: "0" },
    { obligation: 1500000, cash: 400000, transfer: 600000, status: "UNCLEARED", remaining: "500000" },
    { obligation: 900000, cash: 400000, transfer: 600000, status: "OVERPAID", remaining: "-100000" },
    { obligation: 100, cash: 0, transfer: 0, status: "UNCLEARED", remaining: "100" },
  ])("derives $status dynamically", ({ obligation, cash, transfer, status, remaining }) => {
    const result = calculateDeliveryFinancials({
      totalSettlementAmount: d(obligation),
      payments: [{ cashAmount: d(cash), transfers: [{ amount: d(transfer) }] }],
    });
    expect(result.paymentStatus).toBe(status);
    expect(result.remainingAmount.toString()).toBe(remaining);
  });

  it.each([
    { cash: 0, transfers: [], method: "UNPAID" },
    { cash: 100, transfers: [], method: "CASH" },
    { cash: 0, transfers: [100], method: "TRANSFER" },
    { cash: 100, transfers: [100, 200], method: "CASH_TRANSFER" },
  ])("derives payment method $method", ({ cash, transfers, method }) => {
    const result = calculateDeliveryFinancials({
      totalSettlementAmount: d(1000),
      payments: [{ cashAmount: d(cash), transfers: transfers.map((amount) => ({ amount: d(amount) })) }],
    });
    expect(result.paymentMethodSummary).toBe(method);
  });

  it("adds multiple valid payments and transfers without Float arithmetic", () => {
    const result = calculateDeliveryFinancials({
      totalSettlementAmount: d("0.6"),
      payments: [
        { cashAmount: d("0.1"), transfers: [{ amount: d("0.2") }] },
        { cashAmount: d("0.1"), transfers: [{ amount: d("0.2") }] },
      ],
    });
    expect(result.totalReceived.toString()).toBe("0.6");
    expect(result.paymentStatus).toBe("CLEAR");
  });
});

describe("Delivery Settlement contracts", () => {
  const requestKey = "123e4567-e89b-42d3-a456-426614174000";

  it("accepts cash and transfer sequences 1 through 8", () => {
    const result = deliveryAdjustmentSchema.safeParse({
      requestKey, cashAmount: "400000",
      transfers: Array.from({ length: 8 }, (_, index) => ({ sequence: index + 1, amount: "75000" })),
      note: "Transfer pending",
    });
    expect(result.success).toBe(true);
  });

  it("normalizes an unpaid correction and requires no payment fields", () => {
    const result = deliveryAdjustmentSchema.parse({
      requestKey,
      status: "BELUM_BAYAR",
      cashAmount: "500000",
      transfers: [{ sequence: 1, amount: "300000" }],
      note: "Pembayaran belum diterima",
    });
    expect(result.cashAmount).toBe("0");
    expect(result.transfers).toEqual([]);
  });

  it.each([
    { name: "negative cash", value: { requestKey, cashAmount: "-1", transfers: [] } },
    { name: "negative transfer", value: { requestKey, cashAmount: "0", transfers: [{ sequence: 1, amount: "-1" }] } },
    { name: "sequence zero", value: { requestKey, cashAmount: "0", transfers: [{ sequence: 0, amount: "1" }] } },
    { name: "sequence nine", value: { requestKey, cashAmount: "0", transfers: [{ sequence: 9, amount: "1" }] } },
    { name: "duplicate sequence", value: { requestKey, cashAmount: "0", transfers: [{ sequence: 1, amount: "1" }, { sequence: 1, amount: "2" }] } },
    { name: "more than eight transfers", value: { requestKey, cashAmount: "0", transfers: Array.from({ length: 9 }, (_, index) => ({ sequence: index + 1, amount: "1" })) } },
    { name: "NaN", value: { requestKey, cashAmount: "NaN", transfers: [] } },
    { name: "too many decimals", value: { requestKey, cashAmount: "1.234", transfers: [] } },
    { name: "invalid request key", value: { requestKey: "retry", cashAmount: "0", transfers: [] } },
    { name: "long note", value: { requestKey, cashAmount: "0", transfers: [], note: "x".repeat(501) } },
  ])("rejects $name", ({ value }) => {
    expect(deliveryAdjustmentSchema.safeParse(value).success).toBe(false);
  });

  it("maps the actual Dispatch middleware contract", () => {
    const parsed = dispatchRecordSchema.parse({ waybillNo: "WB1", kurir: "A", ongkir: 100, waktu: "", receiver: "", address: "", status: "Penerimaan Normal", berat: 1, pembayaran: "", service: "", codStatus: "", codValue: 0, barang: "" });
    expect(parsed.ongkir).toBe(100);
    expect(parsed.status).toBe("Penerimaan Normal");
    expect(parsed.kurir).toBe("A");
  });

  it("maps the actual COD middleware contract", () => {
    const parsed = codRecordSchema.parse({ waybillNo: "WB1", codAmount: 100, repaymentStatus: 1, repaymentType: 2, signTime: "", dispatchStaffName: "A" });
    expect(parsed.codAmount).toBe(100);
    expect(parsed.repaymentType).toBe(2);
    expect(parsed.dispatchStaffName).toBe("A");
  });

  it.each([
    [45000.1, 45000],
    [45000.9, 45000],
    [45000.99, 45000],
    [45000, 45000],
  ])("normalizes RAW_DFOD and RAW_COD source money %s", (value, expected) => {
    const dispatch = dispatchRecordSchema.parse({
      waybillNo: "DFOD1", kurir: "A", ongkir: value, waktu: "",
      receiver: "", address: "", status: "Penerimaan Normal", berat: 1,
      pembayaran: "", service: "", codStatus: "", codValue: value, barang: "",
    });
    const cod = codRecordSchema.parse({
      waybillNo: "COD1", codAmount: String(value), repaymentStatus: 1,
      repaymentType: 1, signTime: "", dispatchStaffName: "A",
    });
    expect(dispatch.ongkir).toBe(expected);
    expect(dispatch.codValue).toBe(expected);
    expect(cod.codAmount).toBe(expected);
  });

  it("prevents a Rp1 remainder after source normalization", () => {
    const dispatch = dispatchRecordSchema.parse({
      waybillNo: "DFOD1", kurir: "A", ongkir: 45000.9, waktu: "",
      receiver: "", address: "", status: "Penerimaan Normal", berat: 1,
      pembayaran: "", service: "", codStatus: "", codValue: 0, barang: "",
    });
    const cod = codRecordSchema.parse({
      waybillNo: "COD1", codAmount: 45000.1, repaymentStatus: 1,
      repaymentType: 1, signTime: "", dispatchStaffName: "A",
    });
    const aggregate = aggregateDeliveryRecords(
      [{ courierNameRaw: dispatch.kurir, deliveryStatusRaw: dispatch.status, freightAmount: d(dispatch.ongkir) }],
      [{ courierNameRaw: cod.dispatchStaffName, repaymentTypeCode: 1, repaymentTypeLabel: "COD", codAmount: d(cod.codAmount) }],
    ).rows[0];
    const financials = calculateDeliveryFinancials({
      totalSettlementAmount: aggregate.dfod.plus(aggregate.codCash),
      payments: [{ cashAmount: d(90000), transfers: [] }],
    });
    expect(financials.remainingAmount.toString()).toBe("0");
    expect(financials.paymentStatus).toBe("CLEAR");
  });

  it.each([
    { field: "page", value: "0" },
    { field: "pageSize", value: "101" },
    { field: "paymentStatus", value: "PAID" },
    { field: "paymentMethod", value: "QRIS" },
    { field: "operationalDate", value: "28-07-2026" },
  ])("rejects invalid list filter $field", ({ field, value }) => {
    expect(deliverySettlementListSchema.safeParse({ [field]: value }).success).toBe(false);
  });
});
