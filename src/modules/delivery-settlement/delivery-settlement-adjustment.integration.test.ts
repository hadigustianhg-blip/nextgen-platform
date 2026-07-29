/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma transaction mock mirrors dynamic client payloads. */
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const testState = vi.hoisted(() => ({
  payments: [] as Array<Record<string, any>>,
  transfers: [] as Array<Record<string, any>>,
  movements: [] as Array<Record<string, any>>,
  audits: [] as Array<Record<string, any>>,
}));

const master = {
  id: "master-delivery",
  tenantId: "tenant-a",
  outletId: "outlet-a",
  updatedAt: new Date("2026-07-29T00:00:00Z"),
  operationalDate: new Date("2026-07-29T00:00:00Z"),
  courierName: "Kurir Test",
  dfodAmount: new Prisma.Decimal(500000),
  codCashAmount: new Prisma.Decimal(0),
  codQrisAmount: new Prisma.Decimal(0),
  totalSettlementAmount: new Prisma.Decimal(500000),
  needsReview: false,
};

function currentMaster() {
  return {
    ...master,
    payments: testState.payments
      .filter((payment) => payment.recordStatus === "VALID")
      .map((payment) => ({
        ...payment,
        transfers: testState.transfers.filter(
          (transfer) =>
            transfer.settlementPaymentId === payment.id &&
            transfer.recordStatus === "VALID",
        ),
      })),
  };
}

const prismaMock = vi.hoisted(() => {
  const tx = {
    masterSetoran: {
      findFirst: vi.fn(async () => currentMaster()),
    },
    courierSettlementPayment: {
      findUnique: vi.fn(async ({ where }: any) =>
        testState.payments.find(
          (payment) =>
            payment.transactionKey ===
              where.transactionKey_revision.transactionKey &&
            payment.revision === where.transactionKey_revision.revision,
        ),
      ),
      update: vi.fn(async ({ where, data }: any) => {
        const payment = testState.payments.find((item) => item.id === where.id)!;
        Object.assign(payment, data);
        return payment;
      }),
      create: vi.fn(async ({ data }: any) => {
        const payment = {
          id: `payment-${testState.payments.length + 1}`,
          recordStatus: "VALID",
          ...data,
        };
        testState.payments.push(payment);
        return payment;
      }),
    },
    courierSettlementTransfer: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        const rows = testState.transfers.filter(
          (transfer) =>
            transfer.settlementPaymentId === where.settlementPaymentId &&
            transfer.recordStatus === where.recordStatus,
        );
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      }),
      create: vi.fn(async ({ data }: any) => {
        const transfer = {
          id: `transfer-${testState.transfers.length + 1}`,
          recordStatus: "VALID",
          ...data,
        };
        testState.transfers.push(transfer);
        return transfer;
      }),
    },
    cashMovement: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        const rows = testState.movements.filter(
          (movement) =>
            movement.sourceType === where.sourceType &&
            movement.sourceId === where.sourceId &&
            movement.recordStatus === where.recordStatus,
        );
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      }),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const key =
          where.tenantId_outletId_sourceType_sourceId_direction_channel;
        const existing = testState.movements.find(
          (movement) =>
            movement.sourceType === key.sourceType &&
            movement.sourceId === key.sourceId &&
            movement.direction === key.direction &&
            movement.channel === key.channel,
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const movement = {
          id: `movement-${testState.movements.length + 1}`,
          recordStatus: "VALID",
          ...create,
        };
        testState.movements.push(movement);
        return movement;
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: any) => {
        testState.audits.push(data);
        return data;
      }),
    },
  };
  return {
    ...tx,
    $transaction: vi.fn(async (callback: (client: any) => unknown) =>
      callback(tx),
    ),
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

import { adjustDeliverySettlement } from "./delivery-settlement.service";

const context = {
  tenantId: "tenant-a",
  outletId: "outlet-a",
  actorId: "admin-a",
};

beforeEach(() => {
  testState.payments.length = 0;
  testState.transfers.length = 0;
  testState.movements.length = 0;
  testState.audits.length = 0;
  vi.clearAllMocks();
});

describe("Delivery Settlement completed transaction revisions", () => {
  it("supports paid, cancellation, and paid again without double counting", async () => {
    const paid = await adjustDeliverySettlement(context, master.id, {
      requestKey: "10000000-0000-4000-8000-000000000001",
      status: "SUDAH_BAYAR",
      cashAmount: "200000",
      transfers: [
        { sequence: 1, amount: "200000" },
        { sequence: 2, amount: "100000" },
      ],
    });
    expect(paid?.paymentStatus).toBe("CLEAR");
    expect(testState.movements.filter((row) => row.recordStatus === "VALID")).toHaveLength(2);

    const cancelled = await adjustDeliverySettlement(context, master.id, {
      requestKey: "10000000-0000-4000-8000-000000000002",
      status: "BELUM_BAYAR",
      cashAmount: "0",
      transfers: [],
      note: "Setoran belum diterima",
    });
    expect(cancelled?.paymentStatus).toBe("UNCLEARED");
    expect(cancelled?.outstandingAmount).toBe("500000");
    expect(testState.payments.filter((row) => row.recordStatus === "VALID")).toHaveLength(0);
    expect(testState.transfers.every((row) => row.recordStatus === "SUPERSEDED")).toBe(true);
    expect(testState.movements.every((row) => row.recordStatus === "VOID")).toBe(true);

    const repaid = await adjustDeliverySettlement(context, master.id, {
      requestKey: "10000000-0000-4000-8000-000000000003",
      status: "SUDAH_BAYAR",
      cashAmount: "500000",
      transfers: [],
    });
    expect(repaid?.paymentStatus).toBe("CLEAR");
    expect(testState.payments.filter((row) => row.recordStatus === "VALID")).toHaveLength(1);
    expect(testState.movements.filter((row) => row.recordStatus === "VALID")).toHaveLength(1);
  });

  it("replaces a completed payment nominal instead of accumulating it", async () => {
    await adjustDeliverySettlement(context, master.id, {
      requestKey: "20000000-0000-4000-8000-000000000001",
      status: "SUDAH_BAYAR",
      cashAmount: "500000",
      transfers: [],
    });
    const revised = await adjustDeliverySettlement(context, master.id, {
      requestKey: "20000000-0000-4000-8000-000000000002",
      status: "SUDAH_BAYAR",
      cashAmount: "475000",
      transfers: [],
      note: "Koreksi nominal setoran",
    });
    expect(revised?.totalReceived).toBe("475000");
    expect(revised?.outstandingAmount).toBe("25000");
    expect(testState.payments.filter((row) => row.recordStatus === "VALID")).toHaveLength(1);
    expect(
      testState.movements
        .filter((row) => row.recordStatus === "VALID")
        .reduce((sum, row) => sum + Number(row.amount), 0),
    ).toBe(475000);
  });
});
