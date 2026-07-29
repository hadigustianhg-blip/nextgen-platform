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
    findMany: vi.fn(async ({ where }: any) =>
      state.revisions
        .filter((revision) =>
          revision.tenantId === where.tenantId &&
          revision.outletId === where.outletId &&
          where.requestKey.in.includes(revision.requestKey),
        )
        .map(({ requestKey }) => ({ requestKey })),
    ),
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
    findMany: vi.fn(async ({ where }: any) =>
      state.masters
        .filter((master) =>
          where.id.in.includes(master.id) &&
          master.tenantId === where.tenantId &&
          master.outletId === where.outletId,
        )
        .map(hydrate),
    ),
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
            (!where.operationalDate ||
              master.operationalDate.valueOf() === where.operationalDate.valueOf()) &&
            (!where.waybillNo || master.waybillNo.toLowerCase().includes(where.waybillNo.contains.toLowerCase())) &&
            (!where.staffName || master.staffName?.toLowerCase().includes(where.staffName.contains.toLowerCase())),
          )
          .map(hydrate)),
      findFirst: vi.fn(async ({ where }: any) => {
        const master = scopedMaster(where);
        return master ? hydrate(master) : null;
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: any) => {
        state.audits.push(data);
        return data;
      }),
    },
    $transaction: vi.fn(async (callback: any) => {
      const snapshot = {
        revisions: state.revisions.map((revision) => ({ ...revision })),
        payments: state.payments.map((payment) => ({ ...payment })),
        audits: state.audits.map((audit) => ({ ...audit })),
        revisionSequence: state.revisionSequence,
        paymentSequence: state.paymentSequence,
      };
      try {
        return await callback(transactionClient);
      } catch (error) {
        state.revisions.splice(0, state.revisions.length, ...snapshot.revisions);
        state.payments.splice(0, state.payments.length, ...snapshot.payments);
        state.audits.splice(0, state.audits.length, ...snapshot.audits);
        state.revisionSequence = snapshot.revisionSequence;
        state.paymentSequence = snapshot.paymentSequence;
        throw error;
      }
    }),
  },
}));

import {
  adjustPickupSettlement,
  bulkAdjustPickupSettlements,
  calculatePickupFinancials,
  listPickupSettlements,
} from "./pickup-settlement.service";

function addMaster(
  id: string,
  waybillNo: string,
  settlementRaw: string,
  tenantId = "tenant-a",
  outletId = "outlet-a",
  operationalDate = "2026-07-28",
) {
  state.masters.push({
    id,
    tenantId,
    outletId,
    operationalDate: new Date(`${operationalDate}T00:00:00Z`),
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

  it("returns summary for the full filtered result independent of pagination", async () => {
    addMaster("one", "WB-ONE", "Tunai");
    addMaster("two", "WB-TWO", "Tunai");
    state.revisions.push({
      id: "revision-one",
      tenantId: "tenant-a",
      outletId: "outlet-a",
      masterPickupId: "one",
      requestKey: "10000000-0000-4000-8000-000000000101",
      revision: 1,
      recordStatus: "VALID",
      discountAmount: new Prisma.Decimal(1000),
      reason: null,
    });
    state.payments.push(
      {
        id: "payment-one",
        tenantId: "tenant-a",
        outletId: "outlet-a",
        masterPickupId: "one",
        transactionKey: "10000000-0000-4000-8000-000000000201",
        revision: 1,
        recordStatus: "VALID",
        receivedAmount: new Prisma.Decimal(9000),
        paymentMethodRaw: "TUNAI",
        transferAccount: null,
        note: null,
      },
      {
        id: "payment-two",
        tenantId: "tenant-a",
        outletId: "outlet-a",
        masterPickupId: "two",
        transactionKey: "10000000-0000-4000-8000-000000000202",
        revision: 1,
        recordStatus: "VALID",
        receivedAmount: new Prisma.Decimal(10000),
        paymentMethodRaw: "TRANSFER",
        transferAccount: "bank-ops",
        note: null,
      },
    );

    const firstPage = await listPickupSettlements({
      ...context,
      page: 1,
      pageSize: 1,
    });
    const secondPage = await listPickupSettlements({
      ...context,
      page: 2,
      pageSize: 1,
    });
    expect(firstPage.summary).toEqual({
      nominalTotalPickup: "19000",
      totalPickupCount: 2,
      unpaidCount: 0,
      paidCount: 2,
      overpaidCount: 0,
      totalCash: "9000",
      cashPickupCount: 1,
      totalTransfer: "10000",
      transferPickupCount: 1,
    });
    expect(secondPage.summary).toEqual(firstPage.summary);
  });

  it("applies staff, status, method, search, tenant and outlet filters to summary", async () => {
    addMaster("one", "WB-ONE", "Tunai");
    addMaster("two", "WB-TWO", "Tunai");
    addMaster("other", "WB-OTHER", "Tunai", "tenant-b", "outlet-b");
    state.masters.find((master) => master.id === "two")!.staffName = "Siti";
    state.payments.push({
      id: "payment-one",
      tenantId: "tenant-a",
      outletId: "outlet-a",
      masterPickupId: "one",
      transactionKey: "10000000-0000-4000-8000-000000000203",
      revision: 1,
      recordStatus: "VALID",
      receivedAmount: new Prisma.Decimal(10000),
      paymentMethodRaw: "TUNAI",
      transferAccount: null,
      note: null,
    });
    const filtered = await listPickupSettlements({
      ...context,
      page: 1,
      pageSize: 25,
      search: "ONE",
      staff: "Rid",
      paymentStatus: "SUDAH_BAYAR",
      paymentMethod: "TUNAI",
    });
    expect(filtered.summary.totalPickupCount).toBe(1);
    expect(filtered.summary.totalCash).toBe("10000");
    expect(filtered.rows.map((row) => row.waybillNo)).toEqual(["WB-ONE"]);
  });

  it("filters by MasterPickup operationalDate and not updatedAt", async () => {
    addMaster("old", "WB-OLD", "Tunai", "tenant-a", "outlet-a", "2026-07-28");
    addMaster("today", "WB-TODAY", "Tunai", "tenant-a", "outlet-a", "2026-07-29");
    state.masters.find((master) => master.id === "old")!.updatedAt =
      new Date("2026-07-29T12:00:00Z");

    const result = await listPickupSettlements({
      ...context,
      page: 1,
      pageSize: 25,
      operationalDate: "2026-07-29",
    });

    expect(result.rows.map((row) => row.waybillNo)).toEqual(["WB-TODAY"]);
    expect(result.summary.totalPickupCount).toBe(1);
    expect(result.summary.nominalTotalPickup).toBe("10000");
  });

  it("returns all history and full summary when operationalDate is empty", async () => {
    addMaster("old", "WB-OLD", "Tunai", "tenant-a", "outlet-a", "2026-07-28");
    addMaster("today", "WB-TODAY", "Tunai", "tenant-a", "outlet-a", "2026-07-29");
    const result = await listPickupSettlements({
      ...context,
      page: 1,
      pageSize: 1,
      operationalDate: "",
    });
    expect(result.pagination.total).toBe(2);
    expect(result.rows).toHaveLength(1);
    expect(result.summary.totalPickupCount).toBe(2);
    expect(result.summary.nominalTotalPickup).toBe("20000");
  });

  it("combines operationalDate with waybill, staff, status, method, tenant and outlet", async () => {
    addMaster("match", "WB-MATCH", "Tunai", "tenant-a", "outlet-a", "2026-07-29");
    addMaster("wrong-date", "WB-MATCH-OLD", "Tunai", "tenant-a", "outlet-a", "2026-07-28");
    addMaster("wrong-tenant", "WB-MATCH-TENANT", "Tunai", "tenant-b", "outlet-a", "2026-07-29");
    addMaster("wrong-outlet", "WB-MATCH-OUTLET", "Tunai", "tenant-a", "outlet-b", "2026-07-29");
    state.payments.push({
      id: "payment-match",
      tenantId: "tenant-a",
      outletId: "outlet-a",
      masterPickupId: "match",
      transactionKey: "10000000-0000-4000-8000-000000000299",
      revision: 1,
      recordStatus: "VALID",
      receivedAmount: new Prisma.Decimal(10000),
      paymentMethodRaw: "TUNAI",
      transferAccount: null,
      note: null,
    });
    const result = await listPickupSettlements({
      ...context,
      page: 1,
      pageSize: 25,
      operationalDate: "2026-07-29",
      search: "MATCH",
      staff: "RID",
      paymentStatus: "SUDAH_BAYAR",
      paymentMethod: "TUNAI",
    });
    expect(result.rows.map((row) => row.waybillNo)).toEqual(["WB-MATCH"]);
    expect(result.summary.totalCash).toBe("10000");
  });

  it("excludes payments whose pickup parent is outside the active date", async () => {
    addMaster("old", "WB-OLD", "Tunai", "tenant-a", "outlet-a", "2026-07-28");
    addMaster("today", "WB-TODAY", "Tunai", "tenant-a", "outlet-a", "2026-07-29");
    state.payments.push({
      id: "payment-old",
      tenantId: "tenant-a",
      outletId: "outlet-a",
      masterPickupId: "old",
      transactionKey: "10000000-0000-4000-8000-000000000298",
      revision: 1,
      recordStatus: "VALID",
      receivedAmount: new Prisma.Decimal(10000),
      paymentMethodRaw: "TRANSFER",
      transferAccount: "bank-ops",
      note: null,
    });
    const result = await listPickupSettlements({
      ...context,
      page: 1,
      pageSize: 25,
      operationalDate: "2026-07-29",
    });
    expect(result.summary.totalTransfer).toBe("0");
    expect(result.rows[0].waybillNo).toBe("WB-TODAY");
    expect(typeof result.rows[0].finalObligation).toBe("string");
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
    expect(result.summary.totalPickupCount).toBe(5);
    expect(result.summary.paidCount).toBe(2);
    expect(result.summary.unpaidCount).toBe(3);
  });

  it("isolates tenant and outlet reads", async () => {
    addMaster("a", "WB-A", "Tunai");
    addMaster("b", "WB-B", "Tunai", "tenant-b", "outlet-b");
    const result = await listPickupSettlements({ ...context, page: 1, pageSize: 25 });
    expect(result.rows.map((row) => row.waybillNo)).toEqual(["WB-A"]);
  });

  it("creates one VALID cash payment per pickup and applies discount per resi", async () => {
    addMaster("one", "WB-ONE", "Tunai");
    addMaster("two", "WB-TWO", "Tunai");
    const result = await bulkAdjustPickupSettlements(context, {
      batchRequestId: "20000000-0000-4000-8000-000000000001",
      masterPickupIds: ["one", "two"],
      discountAmount: 1000,
      status: "SUDAH_BAYAR",
      paymentMethod: "TUNAI",
    });
    expect(result.adjustedCount).toBe(2);
    expect(state.revisions).toHaveLength(2);
    expect(state.payments).toHaveLength(2);
    expect(state.payments.every((payment) => payment.receivedAmount.toString() === "9000")).toBe(true);
  });

  it("requires a transfer account and voids active payments for Belum Bayar", async () => {
    addMaster("one", "WB-ONE", "Tunai");
    await expect(bulkAdjustPickupSettlements(context, {
      batchRequestId: "20000000-0000-4000-8000-000000000002",
      masterPickupIds: ["one"],
      discountAmount: 0,
      status: "SUDAH_BAYAR",
      paymentMethod: "TRANSFER",
    })).rejects.toThrow("TRANSFER_ACCOUNT_REQUIRED");

    state.payments.push({
      id: "existing-payment",
      tenantId: "tenant-a",
      outletId: "outlet-a",
      masterPickupId: "one",
      transactionKey: "20000000-0000-4000-8000-000000000102",
      revision: 1,
      recordStatus: "VALID",
      receivedAmount: new Prisma.Decimal(10000),
      paymentMethodRaw: "TUNAI",
      transferAccount: null,
      note: null,
    });
    await bulkAdjustPickupSettlements(context, {
      batchRequestId: "20000000-0000-4000-8000-000000000003",
      masterPickupIds: ["one"],
      discountAmount: 0,
      status: "BELUM_BAYAR",
    });
    expect(state.payments[0].recordStatus).toBe("VOID");
  });

  it("rolls back every pickup if one discount is invalid", async () => {
    addMaster("one", "WB-ONE", "Tunai");
    addMaster("two", "WB-TWO", "Tunai");
    state.masters.find((master) => master.id === "two")!.freightAmount =
      new Prisma.Decimal(500);
    await expect(bulkAdjustPickupSettlements(context, {
      batchRequestId: "20000000-0000-4000-8000-000000000004",
      masterPickupIds: ["one", "two"],
      discountAmount: 1000,
      status: "BELUM_BAYAR",
    })).rejects.toThrow("INVALID_DISCOUNT");
    expect(state.revisions).toHaveLength(0);
    expect(state.payments).toHaveLength(0);
    expect(state.audits.some((audit) => audit.entityType === "PICKUP_BULK_ADJUSTMENT_FAILED")).toBe(true);
  });

  it("rejects another tenant, non-Tunai pickup, and remains idempotent", async () => {
    addMaster("one", "WB-ONE", "Tunai");
    addMaster("other", "WB-OTHER", "Tunai", "tenant-b", "outlet-b");
    await expect(bulkAdjustPickupSettlements(context, {
      batchRequestId: "20000000-0000-4000-8000-000000000005",
      masterPickupIds: ["one", "other"],
      discountAmount: 0,
      status: "BELUM_BAYAR",
    })).rejects.toThrow("PICKUP_NOT_FOUND");

    addMaster("monthly", "WB-MONTHLY", "Bulanan");
    await expect(bulkAdjustPickupSettlements(context, {
      batchRequestId: "20000000-0000-4000-8000-000000000006",
      masterPickupIds: ["monthly"],
      discountAmount: 0,
      status: "BELUM_BAYAR",
    })).rejects.toThrow("PICKUP_NOT_FOUND");

    const input = {
      batchRequestId: "20000000-0000-4000-8000-000000000007",
      masterPickupIds: ["one"],
      discountAmount: 0,
      status: "BELUM_BAYAR" as const,
    };
    await bulkAdjustPickupSettlements(context, input);
    await bulkAdjustPickupSettlements(context, input);
    expect(state.revisions.filter((revision) => revision.masterPickupId === "one")).toHaveLength(1);
  });
});
