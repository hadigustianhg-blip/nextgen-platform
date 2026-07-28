import { describe, expect, it } from "vitest";
import {
  addTransferRow,
  buildTransferPayload,
  calculateTransferDraft,
  loadExistingTransfers,
  MAX_DELIVERY_TRANSFERS,
  removeTransferRow,
  rupiahDigits,
} from "./delivery-transfer-form";

describe("dynamic Delivery Settlement transfers", () => {
  it("starts without transfer rows and accepts an empty payload", () => {
    expect(loadExistingTransfers([])).toEqual([]);
    expect(buildTransferPayload([])).toEqual([]);
  });

  it("adds Transfer 1, then Transfer 2", () => {
    const first = addTransferRow([]);
    const second = addTransferRow(first);
    expect(buildTransferPayload(first)).toEqual([{ sequence: 1, amount: "0" }]);
    expect(buildTransferPayload(second).map((item) => item.sequence)).toEqual([1, 2]);
  });

  it("stops at eight transfers and never emits sequence above eight", () => {
    let rows: string[] = [];
    for (let index = 0; index < 12; index += 1) rows = addTransferRow(rows);
    expect(rows).toHaveLength(MAX_DELIVERY_TRANSFERS);
    expect(buildTransferPayload(rows).at(-1)?.sequence).toBe(8);
  });

  it("returns the same state when add is attempted at the limit", () => {
    const rows = Array.from({ length: 8 }, () => "0");
    expect(addTransferRow(rows)).toBe(rows);
  });

  it("removes a middle transfer and compacts subsequent sequences", () => {
    const rows = removeTransferRow(["100", "200", "300"], 1);
    expect(buildTransferPayload(rows)).toEqual([
      { sequence: 1, amount: "100" },
      { sequence: 2, amount: "300" },
    ]);
  });

  it("loads, sorts, and fills existing VALID transfer values", () => {
    expect(loadExistingTransfers([
      { sequence: 2, amount: "250000.00" },
      { sequence: 1, amount: "400000.00" },
    ])).toEqual(["400000", "250000"]);
  });

  it("allows an existing nominal to be edited Decimal-safely", () => {
    const rows = loadExistingTransfers([{ sequence: 1, amount: "400000.00" }]);
    const edited = rows.map((value, index) => index === 0 ? rupiahDigits("Rp 500.000") : value);
    expect(buildTransferPayload(edited)).toEqual([{ sequence: 1, amount: "500000" }]);
  });

  it("allows existing transfers to be removed", () => {
    expect(removeTransferRow(["400000", "250000"], 0)).toEqual(["250000"]);
  });

  it("allows a new transfer after existing transfers", () => {
    const rows = addTransferRow(["400000", "250000"]);
    expect(buildTransferPayload(rows)).toEqual([
      { sequence: 1, amount: "400000" },
      { sequence: 2, amount: "250000" },
      { sequence: 3, amount: "0" },
    ]);
  });

  it("updates totalTransfer and totalReceived immediately", () => {
    const draft = calculateTransferDraft("1000000", "400000", ["300000", "200000"]);
    expect(draft.transferAmount).toBe(500000n);
    expect(draft.totalReceived).toBe(900000n);
    expect(draft.remainingAmount).toBe(100000n);
  });

  it("becomes Clear for an exact payment", () => {
    expect(calculateTransferDraft("1000000", "400000", ["600000"]).status).toBe("CLEAR");
  });

  it("becomes Overpaid and exposes the overpayment amount", () => {
    const draft = calculateTransferDraft("1000000", "500000", ["600000"]);
    expect(draft.status).toBe("OVERPAID");
    expect(draft.overpaidAmount).toBe(100000n);
    expect(draft.outstandingAmount).toBe(0n);
  });

  it("keeps all request amounts as digit strings in ordered payload", () => {
    const payload = buildTransferPayload(["Rp 500.000", "300000"]);
    expect(payload).toEqual([
      { sequence: 1, amount: "500000" },
      { sequence: 2, amount: "300000" },
    ]);
    expect(payload.every((item) => typeof item.amount === "string")).toBe(true);
  });

  it.each(["", "Rp 0", "NaN", "-100"])("normalizes non-digit input %j without NaN or negative values", (value) => {
    expect(rupiahDigits(value)).toMatch(/^\d+$/);
    expect(BigInt(rupiahDigits(value))).toBeGreaterThanOrEqual(0n);
  });
});
