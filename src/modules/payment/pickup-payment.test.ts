/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  payments: [] as Array<Record<string, any>>,
  movements: [] as Array<Record<string, any>>,
  audits: [] as Array<Record<string, any>>,
}));
const master = {
  id: "10000000-0000-4000-8000-000000000010",
  tenantId: "10000000-0000-4000-8000-000000000011",
  outletId: "10000000-0000-4000-8000-000000000012",
  waybillNo: "WB-001",
  operationalDate: new Date("2026-07-20T00:00:00Z"),
  freightAmount: new Prisma.Decimal(1000),
  settlementRevisions: [{ discountAmount: new Prisma.Decimal(0) }],
  payments: [] as Array<Record<string, any>>,
};
const secondMaster = {
  ...master,
  id: "10000000-0000-4000-8000-000000000020",
  waybillNo: "WB-002",
  freightAmount: new Prisma.Decimal(2000),
};
const masters = [master, secondMaster];
const tx = {
  masterPickup: {
    findFirst: vi.fn(async () => ({
      ...master,
      payments: state.payments.filter((item) => item.recordStatus === "VALID"),
    })),
    findMany: vi.fn(async ({ where }: any) => masters
      .filter((item) => where.id.in.includes(item.id) && item.tenantId === where.tenantId && item.outletId === where.outletId)
      .map((item) => ({
        ...item,
        payments: state.payments.filter((payment) => payment.masterPickupId === item.id && payment.recordStatus === "VALID"),
      }))),
  },
  pickupPayment: {
    findMany: vi.fn(async ({ where }: any) => state.payments.filter((item) =>
      item.tenantId === where.tenantId && item.outletId === where.outletId &&
      where.transactionKey.in.includes(item.transactionKey) && item.revision === where.revision,
    )),
    findUnique: vi.fn(async ({ where }: any) => state.payments.find((item) =>
      item.transactionKey === where.transactionKey_revision.transactionKey &&
      item.revision === where.transactionKey_revision.revision,
    ) ?? null),
    findFirst: vi.fn(async ({ where }: any) => state.payments.find((item) => item.id === where.id) ?? null),
    create: vi.fn(async ({ data }: any) => {
      const row = { id: `20000000-0000-4000-8000-${String(state.payments.length + 1).padStart(12, "0")}`, recordStatus: "VALID", ...data };
      state.payments.push(row); return row;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const row = state.payments.find((item) => item.id === where.id)!;
      Object.assign(row, data); return row;
    }),
  },
  cashMovement: {
    upsert: vi.fn(async ({ create }: any) => {
      const row = { id: `movement-${state.movements.length + 1}`, recordStatus: "VALID", ...create };
      state.movements.push(row); return row;
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const rows = state.movements.filter((item) => item.sourceId === where.sourceId && item.recordStatus === where.recordStatus);
      rows.forEach((row) => Object.assign(row, data)); return { count: rows.length };
    }),
  },
  auditLog: { create: vi.fn(async ({ data }: any) => { state.audits.push(data); return data; }) },
};
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: vi.fn(async (callback: any) => callback(tx)) },
}));

import {
  bulkAdjustPickupPayments, createPickupPayment, pickupReceivableStatus, receivableAgeBucket,
  receivableAgeDays, voidPickupPayment,
} from "./pickup-payment.service";
import { cashBalance } from "./cash-flow.service";
import { pickupPaymentBulkAdjustmentSchema, pickupPaymentInputSchema, pickupPaymentListSchema } from "./pickup-payment.validation";
import {
  canCreatePickupPayment, canManagePickupPayment, canReadPickupPayment,
} from "./pickup-payment.authorization";
import type { SessionContext } from "@/lib/auth/session";

const d = (value: string | number) => new Prisma.Decimal(value);
const context = { tenantId: master.tenantId, outletId: master.outletId, actorId: "10000000-0000-4000-8000-000000000013" };
const input = {
  requestKey: "30000000-0000-4000-8000-000000000001",
  masterPickupId: master.id, paymentDate: "2026-07-29", method: "CASH" as const,
  amount: "400", reference: "REF-1", bank: "", note: "",
};

beforeEach(() => {
  state.payments.length = 0; state.movements.length = 0; state.audits.length = 0;
  vi.clearAllMocks();
});

describe("Pickup Payment AR formulas", () => {
  it.each([
    [0, "BELUM_BAYAR"], [400, "SEBAGIAN"], [1000, "LUNAS"], [1200, "LEBIH_BAYAR"],
  ])("derives status for paid %s", (paid, expected) => {
    expect(pickupReceivableStatus(new Prisma.Decimal(1000), new Prisma.Decimal(paid))).toBe(expected);
  });
  it("calculates overdue age and buckets", () => {
    expect(receivableAgeDays(new Date("2026-07-20T00:00:00Z"), "2026-07-29")).toBe(9);
    expect(receivableAgeBucket(0)).toBe("TODAY");
    expect(receivableAgeBucket(2)).toBe("1_3");
    expect(receivableAgeBucket(6)).toBe("4_7");
    expect(receivableAgeBucket(9)).toBe("OVER_7");
    expect(receivableAgeBucket(31)).toBe("OVER_30");
  });
});

describe("Pickup Payment transaction and cash flow", () => {
  it("creates a cash payment and matching CashMovement once", async () => {
    const first = await createPickupPayment(context, input);
    const replay = await createPickupPayment(context, input);
    expect(first?.id).toBe(replay?.id);
    expect(state.payments).toHaveLength(1);
    expect(state.movements).toMatchObject([{
      direction: "IN", channel: "CASH", movementType: "PICKUP_PAYMENT",
      reference: "WB-001", sourceType: "PickupPayment",
    }]);
    const balance = cashBalance(state.movements as Parameters<typeof cashBalance>[0]);
    expect(balance.cash.toString()).toBe("400");
    expect(balance.bank.toString()).toBe("0");
    expect(pickupReceivableStatus(d(1000), state.payments[0].receivedAmount)).toBe("SEBAGIAN");
  });
  it("creates transfer as BANK movement", async () => {
    await createPickupPayment(context, {
      ...input, requestKey: "30000000-0000-4000-8000-000000000002",
      method: "TRANSFER", bank: "BCA",
    });
    expect(state.movements[0].channel).toBe("BANK");
  });
  it("requires confirmation for overpayment and supports it after confirmation", async () => {
    await expect(createPickupPayment(context, {
      ...input, amount: "1200",
    })).rejects.toThrow("OVERPAYMENT_CONFIRMATION_REQUIRED");
    await createPickupPayment(context, { ...input, amount: "1200", confirmOverpayment: true });
    expect(state.payments[0].receivedAmount.toString()).toBe("1200");
  });
  it("voids payment and its cash movement without deleting history", async () => {
    const payment = await createPickupPayment(context, input);
    await voidPickupPayment(context, payment!.id, {
      requestKey: "30000000-0000-4000-8000-000000000003", reason: "Salah input",
    });
    expect(state.payments).toHaveLength(1);
    expect(state.payments[0].recordStatus).toBe("VOID");
    expect(state.movements[0].recordStatus).toBe("VOID");
    expect(cashBalance(state.movements as Parameters<typeof cashBalance>[0]).cash.toString()).toBe("0");
    expect(pickupReceivableStatus(d(1000), d(0))).toBe("BELUM_BAYAR");
    expect(state.audits.some((item) => item.entityType === "PICKUP_PAYMENT_VOIDED")).toBe(true);
  });
});

describe("Pickup Payment validation, filters, pagination, and RBAC", () => {
  it("rejects float, zero, and missing transfer bank", () => {
    expect(pickupPaymentInputSchema.safeParse({ ...input, amount: "1.5" }).success).toBe(false);
    expect(pickupPaymentInputSchema.safeParse({ ...input, amount: "0" }).success).toBe(false);
    expect(pickupPaymentInputSchema.safeParse({ ...input, method: "TRANSFER", bank: "" }).success).toBe(false);
  });
  it("accepts search, filter, and pagination", () => {
    const parsed = pickupPaymentListSchema.parse({
      page: "2", pageSize: "50", status: "LUNAS", age: "OVER_30",
      method: "TRANSFER", search: "WB-001",
    });
    expect(parsed).toMatchObject({ page: 2, pageSize: 50, status: "LUNAS", age: "OVER_30" });
  });
  it("enforces Viewer, Operational, Admin, and Owner roles", () => {
    const session = (roles: string[]) => ({ roles, outletId: master.outletId } as SessionContext);
    expect(canReadPickupPayment(session(["VIEWER"]))).toBe(true);
    expect(canCreatePickupPayment(session(["VIEWER"]))).toBe(false);
    expect(canCreatePickupPayment(session(["OPERATIONAL"]))).toBe(true);
    expect(canManagePickupPayment(session(["OPERATIONAL"]))).toBe(false);
    expect(canManagePickupPayment(session(["ADMIN"]))).toBe(true);
    expect(canManagePickupPayment(session(["OWNER"]))).toBe(true);
  });
});

describe("Pickup Payment bulk adjustment", () => {
  const bulkInput = {
    batchRequestId: "30000000-0000-4000-8000-000000000010",
    masterPickupIds: [master.id, secondMaster.id],
    paymentDate: "2026-07-29",
    method: "CASH" as const,
    reference: "BATCH-1",
    bank: "",
    note: "Pelunasan massal",
  };

  it("pays every selected outstanding atomically and derives LUNAS status", async () => {
    const result = await bulkAdjustPickupPayments(context, bulkInput);
    expect(result).toMatchObject({ adjustedCount: 2, totalAdjustment: "3000", idempotent: false });
    expect(state.payments).toHaveLength(2);
    expect(state.movements).toHaveLength(2);
    expect(pickupReceivableStatus(d(1000), state.payments[0].receivedAmount)).toBe("LUNAS");
    expect(pickupReceivableStatus(d(2000), state.payments[1].receivedAmount)).toBe("LUNAS");
    expect(state.audits.filter((item) => item.entityType === "PICKUP_PAYMENT_CREATED")).toHaveLength(2);
    expect(state.audits.some((item) => item.entityType === "PICKUP_PAYMENT_BULK_ADJUSTED")).toBe(true);
  });

  it("applies only each record remaining outstanding and creates individual history", async () => {
    state.payments.push({
      id: "existing", tenantId: master.tenantId, outletId: master.outletId,
      masterPickupId: master.id, transactionKey: "30000000-0000-4000-8000-000000000099",
      revision: 1, recordStatus: "VALID", receivedAmount: d(400),
    });
    const result = await bulkAdjustPickupPayments(context, bulkInput);
    expect(result.totalAdjustment).toBe("2600");
    expect(state.payments.find((item) => item.masterPickupId === master.id && item.id !== "existing")?.receivedAmount.toString()).toBe("600");
  });

  it("replays the same batch without duplicate payments or movements", async () => {
    await bulkAdjustPickupPayments(context, bulkInput);
    const replay = await bulkAdjustPickupPayments(context, bulkInput);
    expect(replay.idempotent).toBe(true);
    expect(state.payments).toHaveLength(2);
    expect(state.movements).toHaveLength(2);
  });

  it("rejects one missing, foreign-scope, or already paid record before any write", async () => {
    await expect(bulkAdjustPickupPayments(context, {
      ...bulkInput,
      masterPickupIds: [master.id, "10000000-0000-4000-8000-000000000099"],
    })).rejects.toThrow("PICKUP_PAYMENT_NOT_FOUND");
    expect(state.payments).toHaveLength(0);

    state.payments.push({
      id: "paid", tenantId: master.tenantId, outletId: master.outletId,
      masterPickupId: master.id, transactionKey: "30000000-0000-4000-8000-000000000098",
      revision: 1, recordStatus: "VALID", receivedAmount: d(1000),
    });
    await expect(bulkAdjustPickupPayments(context, {
      ...bulkInput,
      masterPickupIds: [master.id],
    })).rejects.toThrow("PICKUP_PAYMENT_NOT_ELIGIBLE");
    expect(state.payments).toHaveLength(1);
  });

  it("validates empty, duplicate, oversized, negative, and transfer payloads", () => {
    expect(pickupPaymentBulkAdjustmentSchema.safeParse({ ...bulkInput, masterPickupIds: [] }).success).toBe(false);
    expect(pickupPaymentBulkAdjustmentSchema.safeParse({ ...bulkInput, masterPickupIds: [master.id, master.id] }).success).toBe(false);
    expect(pickupPaymentBulkAdjustmentSchema.safeParse({ ...bulkInput, masterPickupIds: Array.from({ length: 501 }, (_, index) => `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`) }).success).toBe(false);
    expect(pickupPaymentBulkAdjustmentSchema.safeParse({ ...bulkInput, amount: -1 }).success).toBe(false);
    expect(pickupPaymentBulkAdjustmentSchema.safeParse({ ...bulkInput, method: "TRANSFER", bank: "" }).success).toBe(false);
  });
});
