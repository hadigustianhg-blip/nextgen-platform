/* eslint-disable @typescript-eslint/no-explicit-any */
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  masters: [] as Array<Record<string, any>>,
  revisions: [] as Array<Record<string, any>>,
  payments: [] as Array<Record<string, any>>,
  audits: [] as Array<Record<string, any>>,
  revisionSequence: 0,
  paymentSequence: 0,
}));

function scopedMaster(where: any) {
  return state.masters.find((master) =>
    master.id === where.id &&
    master.tenantId === where.tenantId &&
    master.outletId === where.outletId,
  );
}

function hydrate(master: Record<string, any>) {
  return {
    ...master,
    settlementRevisions: state.revisions
      .filter((revision) => revision.masterPickupId === master.id && revision.recordStatus === "VALID")
      .sort((a, b) => b.revision - a.revision),
    payments: state.payments
      .filter((payment) => payment.masterPickupId === master.id && payment.recordStatus === "VALID")
      .sort((a, b) => b.revision - a.revision),
  };
}

const transactionClient = {
  pickupSettlementRevision: {
    findUnique: vi.fn(async ({ where }: any) => {
      const key = where.tenantId_outletId_requestKey;
      return state.revisions.find((revision) =>
        revision.tenantId === key.tenantId &&
        revision.outletId === key.outletId &&
        revision.requestKey === key.requestKey,
      ) ?? null;
    }),
    aggregate: vi.fn(async ({ where }: any) => ({
      _max: {
        revision: Math.max(
          0,
          ...state.revisions.filter((revision) => revision.masterPickupId === where.masterPickupId).map((revision) => revision.revision),
        ) || null,
      },
    })),
    update: vi.fn(async ({ where, data }: any) => {
      const revision = state.revisions.find((item) => item.id === where.id)!;
      Object.assign(revision, data);
      return revision;
    }),
    create: vi.fn(async ({ data }: any) => {
      const revision = { id: `revision-${++state.revisionSequence}`, ...data };
      state.revisions.push(revision);
      return revision;
    }),
  },
  masterPickup: {
    findFirst: vi.fn(async ({ where }: any) => {
      const master = scopedMaster(where);
      return master ? hydrate(master) : null;
    }),
  },
  pickupPayment: {
    update: vi.fn(async ({ where, data }: any) => {
      const payment = state.payments.find((item) => item.id === where.id)!;
      Object.assign(payment, data);
      return payment;
    }),
    create: vi.fn(async ({ data }: any) => {
      const payment = { id: `payment-${++state.paymentSequence}`, createdAt: new Date(), ...data };
      state.payments.push(payment);
      return payment;
    }),
  },
  auditLog: {
    create: vi.fn(async ({ data }: any) => {
      state.audits.push(data);
      return data;
    }),
  },
};

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    masterPickup: {
      findMany: vi.fn(async ({ where }: any) =>
        state.masters
          .filter((master) =>
            master.tenantId === where.tenantId &&
            master.outletId === where.outletId &&
            (!where.waybillNo || master.waybillNo.toLowerCase().includes(where.waybillNo.contains.toLowerCase())) &&
            (!where.staffName || master.staffName?.toLowerCase().includes(where.staffName.contains.toLowerCase())),
          )
          .map(hydrate)),
      findFirst: vi.fn(async ({ where }: any) => {
        const master = scopedMaster(where);
        return master ? hydrate(master) : null;
      }),
    },
    $transaction: vi.fn(async (callback: any) => callback(transactionClient)),
  },
}));

import {
  adjustPickupSettlement,
  calculatePickupFinancials,
  listPickupSettlements,
} from "./pickup-settlement.service";

function addMaster(
  id: string,
  waybillNo: string,
  settlementRaw: string,
  tenantId = "tenant-a",
  outletId = "outlet-a",
) {
  state.masters.push({
    id,
    tenantId,
    outletId,
    operationalDate: new Date("2026-07-28T00:00:00Z"),
    updatedAt: new Date(),
    waybillNo,
    staffName: "Ridwan",
    senderName: "Sender Test",
    freightAmount: new Prisma.Decimal(10000),
    syncStatus: "NORMALIZED",
    rawPickup: { settlementRaw },
  });
}

const context = { tenantId: "tenant-a", outletId: "outlet-a", actorId: "admin-a" };

beforeEach(() => {
  state.masters.length = 0;
  state.revisions.length = 0;
  state.payments.length = 0;
  state.audits.length = 0;
  state.revisionSequence = 0;
  state.paymentSequence = 0;
  process.env.PICKUP_TRANSFER_ACCOUNTS = JSON.stringify([
    { id: "bank-ops", label: "Bank Operasional •••• 1234" },
  ]);
  vi.clearAllMocks();
});

describe("Pickup Settlement service", () => {
  it("shows only trimmed case-insensitive Tunai and excludes Bulanan", async () => {
    addMaster("cash", "WB-CASH", "  TuNaI ");
    addMaster("monthly", "WB-MONTHLY", "Bulanan");
    const result = await listPickupSettlements({ ...context, page: 1, pageSize: 25 });
    expect(result.rows.map((row) => row.waybillNo)).toEqual(["WB-CASH"]);
  });

  it("derives payment status from obligation minus valid payments", () => {
    const result = calculatePickupFinancials({
      freightAmount: new Prisma.Decimal(10000),
      settlementRevisions: [{ discountAmount: new Prisma.Decimal(1000) }],
      payments: [{ receivedAmount: new Prisma.Decimal(9000), paymentMethodRaw: "TUNAI", transferAccount: null }],
    });
    expect(result.paymentStatus).toBe("SUDAH_BAYAR");
    expect(result.finalObligation.toString()).toBe("9000");
  });

  it("does not create a VALID payment for Belum Bayar", async () => {
    addMaster("pickup", "WB-1", "Tunai");
    await adjustPickupSettlement(context, "pickup", {
      requestId: "10000000-0000-4000-8000-000000000001",
      discountAmount: 0,
      status: "BELUM_BAYAR",
    });
    expect(state.revisions).toHaveLength(1);
    expect(state.payments.filter((payment) => payment.recordStatus === "VALID")).toHaveLength(0);
  });

  it("creates a full valid cash payment and blocks discount above freight", async () => {
    addMaster("pickup", "WB-1", "Tunai");
    await adjustPickupSettlement(context, "pickup", {
      requestId: "10000000-0000-4000-8000-000000000002",
      discountAmount: 1000,
      status: "SUDAH_BAYAR",
      paymentMethod: "TUNAI",
    });
    expect(state.payments[0].recordStatus).toBe("VALID");
    expect(state.payments[0].receivedAmount.toString()).toBe("9000");
    await expect(adjustPickupSettlement(context, "pickup", {
      requestId: "10000000-0000-4000-8000-000000000003",
      discountAmount: 11000,
      status: "BELUM_BAYAR",
    })).rejects.toThrow("INVALID_DISCOUNT");
  });

  it("requires a configured account for transfer", async () => {
    addMaster("pickup", "WB-1", "Tunai");
    await expect(adjustPickupSettlement(context, "pickup", {
      requestId: "10000000-0000-4000-8000-000000000004",
      discountAmount: 0,
      status: "SUDAH_BAYAR",
      paymentMethod: "TRANSFER",
    })).rejects.toThrow("TRANSFER_ACCOUNT_REQUIRED");
  });

  it("is idempotent for double-submit", async () => {
    addMaster("pickup", "WB-1", "Tunai");
    const input = {
      requestId: "10000000-0000-4000-8000-000000000005",
      discountAmount: 0,
      status: "SUDAH_BAYAR" as const,
      paymentMethod: "TUNAI" as const,
    };
    await adjustPickupSettlement(context, "pickup", input);
    await adjustPickupSettlement(context, "pickup", input);
    expect(state.revisions).toHaveLength(1);
    expect(state.payments).toHaveLength(1);
  });

  it("keeps two paid Ridwan waybills paid when three new sync results appear", async () => {
    addMaster("old-1", "WB-OLD-1", "Tunai");
    addMaster("old-2", "WB-OLD-2", "Tunai");
    for (const [index, id] of ["old-1", "old-2"].entries()) {
      await adjustPickupSettlement(context, id, {
        requestId: `10000000-0000-4000-8000-00000000001${index}`,
        discountAmount: 0,
        status: "SUDAH_BAYAR",
        paymentMethod: "TUNAI",
      });
    }
    const paymentCountBeforeReplay = state.payments.length;
    addMaster("new-1", "WB-NEW-1", "Tunai");
    addMaster("new-2", "WB-NEW-2", "Tunai");
    addMaster("new-3", "WB-NEW-3", "Tunai");
    const result = await listPickupSettlements({ ...context, page: 1, pageSize: 25 });
    expect(result.rows.filter((row) => row.paymentStatus === "SUDAH_BAYAR")).toHaveLength(2);
    expect(result.rows.filter((row) => row.paymentStatus === "BELUM_BAYAR")).toHaveLength(3);
    expect(state.payments).toHaveLength(paymentCountBeforeReplay);
  });

  it("isolates tenant and outlet reads", async () => {
    addMaster("a", "WB-A", "Tunai");
    addMaster("b", "WB-B", "Tunai", "tenant-b", "outlet-b");
    const result = await listPickupSettlements({ ...context, page: 1, pageSize: 25 });
    expect(result.rows.map((row) => row.waybillNo)).toEqual(["WB-A"]);
  });
});
