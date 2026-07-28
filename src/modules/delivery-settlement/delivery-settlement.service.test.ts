import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import {
  aggregateDeliveryRecords,
  calculateDeliveryFinancials,
  normalizeComparison,
  sourceHash,
} from "./delivery-settlement.service";
import {
  codRecordSchema,
  deliveryAdjustmentSchema,
  deliverySettlementListSchema,
  dispatchRecordSchema,
} from "./delivery-settlement.validation";

const d = (value: number | string) => new Prisma.Decimal(value);

describe("Delivery Settlement aggregation", () => {
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

  it("classifies COD codes 0 and 1 as cash and 2 as QRIS", () => {
    const result = aggregateDeliveryRecords([], [
      { courierNameRaw: "RIDWAN", repaymentTypeCode: 0, repaymentTypeLabel: "COD", codAmount: d(400000) },
      { courierNameRaw: "RIDWAN", repaymentTypeCode: 1, repaymentTypeLabel: "COD", codAmount: d(400000) },
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

  it("marks unknown and missing courier identities as anomalies", () => {
    const result = aggregateDeliveryRecords(
      [{ courierNameRaw: "", deliveryStatusRaw: "Penerimaan Normal", freightAmount: d(10) }],
      [{ courierNameRaw: "A", repaymentTypeCode: 9, repaymentTypeLabel: null, codAmount: d(20) }],
    );
    expect(result.anomaly).toBe(2);
    expect(result.rows[0].codCash.toString()).toBe("0");
    expect(result.rows[0].codQris.toString()).toBe("0");
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
});

describe("Delivery Settlement financial calculation", () => {
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
    { field: "page", value: "0" },
    { field: "pageSize", value: "101" },
    { field: "paymentStatus", value: "PAID" },
    { field: "paymentMethod", value: "QRIS" },
    { field: "operationalDate", value: "28-07-2026" },
  ])("rejects invalid list filter $field", ({ field, value }) => {
    expect(deliverySettlementListSchema.safeParse({ [field]: value }).success).toBe(false);
  });
});
