import { describe, expect, it, vi } from "vitest";
import {
  pickupAdjustmentSchema,
  pickupBulkAdjustmentSchema,
} from "./pickup-settlement.validation";

vi.mock("server-only", () => ({}));

const adjustment = {
  requestId: "10000000-0000-4000-8000-000000000001",
  discountAmount: "0",
  status: "SUDAH_BAYAR",
  paymentMethod: "TRANSFER",
} as const;

describe("Pickup transfer account contracts", () => {
  it("provides BCA, BRI and QRIS from the existing account source", async () => {
    const { getPickupTransferAccounts } = await import("./transfer-accounts");
    expect(getPickupTransferAccounts()).toEqual([
      { id: "BCA", label: "BCA" },
      { id: "BRI", label: "BRI" },
      { id: "QRIS", label: "QRIS" },
    ]);
  });

  it.each(["BCA", "BRI", "QRIS"] as const)(
    "accepts %s for a transfer adjustment",
    (transferAccountId) => {
      expect(
        pickupAdjustmentSchema.safeParse({
          ...adjustment,
          transferAccountId,
        }).success,
      ).toBe(true);
    },
  );

  it("rejects an empty or invalid transfer account", () => {
    expect(
      pickupAdjustmentSchema.safeParse({
        ...adjustment,
        transferAccountId: "",
      }).success,
    ).toBe(false);
    expect(
      pickupAdjustmentSchema.safeParse({
        ...adjustment,
        transferAccountId: "BANK_LAIN",
      }).success,
    ).toBe(false);
  });

  it("normalizes a stale account to null for non-transfer methods", () => {
    const result = pickupAdjustmentSchema.parse({
      ...adjustment,
      paymentMethod: "TUNAI",
      transferAccountId: "BCA",
    });
    expect(result.transferAccountId).toBeNull();
  });

  it("applies the same validation and normalization to bulk adjustments", () => {
    const base = {
      batchRequestId: "20000000-0000-4000-8000-000000000001",
      masterPickupIds: ["30000000-0000-4000-8000-000000000001"],
      discountAmount: "0",
      status: "SUDAH_BAYAR",
      paymentMethod: "TRANSFER",
    };
    expect(
      pickupBulkAdjustmentSchema.safeParse({
        ...base,
        transferAccountId: "QRIS",
      }).success,
    ).toBe(true);
    expect(
      pickupBulkAdjustmentSchema.safeParse({
        ...base,
        transferAccountId: "",
      }).success,
    ).toBe(false);
    expect(
      pickupBulkAdjustmentSchema.parse({
        ...base,
        paymentMethod: "TUNAI",
        transferAccountId: "BRI",
      }).transferAccountId,
    ).toBeNull();
  });
});
