/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  expenses: [] as Array<Record<string, any>>,
  closings: [] as Array<Record<string, any>>,
  requests: [] as Array<Record<string, any>>,
  audits: [] as Array<Record<string, any>>,
  expenseSequence: 0,
  closingSequence: 0,
}));

function sameDate(left: Date, right: Date) {
  return left.valueOf() === right.valueOf();
}

const tx = {
  operationalActionRequest: {
    findUnique: vi.fn(async ({ where }: any) => {
      const key = where.tenantId_outletId_requestKey;
      return state.requests.find((row) =>
        row.tenantId === key.tenantId &&
        row.outletId === key.outletId &&
        row.requestKey === key.requestKey,
      ) ?? null;
    }),
    create: vi.fn(async ({ data }: any) => {
      state.requests.push(data);
      return data;
    }),
  },
  operationalClosing: {
    findUnique: vi.fn(async ({ where }: any) => {
      const key = where.tenantId_outletId_operationalDate;
      return state.closings.find((row) =>
        row.tenantId === key.tenantId &&
        row.outletId === key.outletId &&
        sameDate(row.operationalDate, key.operationalDate),
      ) ?? null;
    }),
    upsert: vi.fn(async ({ where, create, update }: any) => {
      const key = where.tenantId_outletId_operationalDate;
      const existing = state.closings.find((row) =>
        row.tenantId === key.tenantId &&
        row.outletId === key.outletId &&
        sameDate(row.operationalDate, key.operationalDate),
      );
      if (existing) {
        Object.assign(existing, update, {
          version: typeof update.version === "object"
            ? existing.version + update.version.increment
            : update.version,
        });
        return existing;
      }
      const row = { id: `closing-${++state.closingSequence}`, version: 1, ...create };
      state.closings.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const row = state.closings.find((item) => item.id === where.id)!;
      Object.assign(row, data, {
        version: typeof data.version === "object"
          ? row.version + data.version.increment
          : data.version,
      });
      return row;
    }),
  },
  operationalExpense: {
    findFirst: vi.fn(async ({ where }: any) =>
      state.expenses.find((row) =>
        row.id === where.id &&
        row.tenantId === where.tenantId &&
        row.outletId === where.outletId,
      ) ?? null),
    create: vi.fn(async ({ data }: any) => {
      const row = {
        id: `expense-${++state.expenseSequence}`,
        status: "VALID",
        amount: new Prisma.Decimal(data.amount),
        ...data,
      };
      state.expenses.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const row = state.expenses.find((item) => item.id === where.id)!;
      Object.assign(row, data, {
        amount: data.amount ? new Prisma.Decimal(data.amount) : row.amount,
      });
      return row;
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
    $transaction: vi.fn(async (callback: any) => callback(tx)),
  },
}));

import {
  closeOperational,
  createOperationalExpense,
  reopenOperational,
  updateOperationalExpense,
  voidOperationalExpense,
} from "./operational-settlement.service";

const context = { tenantId: "tenant-a", outletId: "outlet-a", actorId: "admin-a" };
const date = "2026-07-29";

beforeEach(() => {
  state.expenses.length = 0;
  state.closings.length = 0;
  state.requests.length = 0;
  state.audits.length = 0;
  state.expenseSequence = 0;
  state.closingSequence = 0;
  vi.clearAllMocks();
});

describe("Operational Settlement lifecycle", () => {
  it("creates an expense once for an idempotent request", async () => {
    const input = {
      requestKey: "10000000-0000-4000-8000-000000000001",
      operationalDate: date,
      category: "BBM",
      amount: "100000",
      vehiclePlate: "d 8634 ab",
    };
    const first = await createOperationalExpense(context, input);
    const replay = await createOperationalExpense(context, input);
    expect(first?.id).toBe(replay?.id);
    expect(state.expenses).toHaveLength(1);
    expect(state.expenses[0].vehiclePlate).toBe("D8634AB");
    expect(state.audits.filter((row) => row.entityType === "OPERATIONAL_EXPENSE_CREATED")).toHaveLength(1);
  });

  it("voids without hard delete and removes the amount from valid state", async () => {
    const expense = await createOperationalExpense(context, {
      requestKey: "10000000-0000-4000-8000-000000000002",
      operationalDate: date, category: "Parkir", amount: "10000",
    });
    await voidOperationalExpense(context, expense!.id, {
      requestKey: "10000000-0000-4000-8000-000000000003",
      reason: "Salah input",
    });
    expect(state.expenses).toHaveLength(1);
    expect(state.expenses[0].status).toBe("VOID");
    expect(state.audits.some((row) => row.entityType === "OPERATIONAL_EXPENSE_VOID")).toBe(true);
  });

  it("blocks create and edit after closing", async () => {
    const expense = await createOperationalExpense(context, {
      requestKey: "10000000-0000-4000-8000-000000000004",
      operationalDate: date, category: "Tol", amount: "10000",
    });
    await closeOperational(context, {
      requestKey: "10000000-0000-4000-8000-000000000005",
      operationalDate: date, physicalCash: "500000",
    });
    await expect(createOperationalExpense(context, {
      requestKey: "10000000-0000-4000-8000-000000000006",
      operationalDate: date, category: "Tol", amount: "20000",
    })).rejects.toThrow("OPERATIONAL_CLOSED");
    await expect(updateOperationalExpense(context, expense!.id, {
      requestKey: "10000000-0000-4000-8000-000000000007",
      category: "Tol", amount: "20000",
    })).rejects.toThrow("OPERATIONAL_CLOSED");
  });

  it("reopens with a reason and permits editing again", async () => {
    const expense = await createOperationalExpense(context, {
      requestKey: "10000000-0000-4000-8000-000000000008",
      operationalDate: date, category: "ATK", amount: "10000",
    });
    await closeOperational(context, {
      requestKey: "10000000-0000-4000-8000-000000000009",
      operationalDate: date, physicalCash: "500000",
    });
    await reopenOperational(context, {
      requestKey: "10000000-0000-4000-8000-000000000010",
      operationalDate: date, reason: "Ada koreksi ATK",
    });
    await updateOperationalExpense(context, expense!.id, {
      requestKey: "10000000-0000-4000-8000-000000000011",
      category: "ATK", amount: "15000",
    });
    expect(state.closings[0].status).toBe("OPEN");
    expect(state.closings[0].reopenReason).toBe("Ada koreksi ATK");
    expect(state.expenses[0].amount.toString()).toBe("15000");
    expect(state.audits.some((row) => row.entityType === "OPERATIONAL_REOPENED")).toBe(true);
  });
});
