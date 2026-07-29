import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { cashBalance, runningBalances } from "./cash-flow.service";
import {
  cashFlowListSchema, manualExpenseSchema, manualIncomeSchema,
} from "./cash-flow.validation";
import {
  canCreateManualCashFlow, canManageManualCashFlow, canReadCashFlow,
} from "./cash-flow.authorization";
import type { SessionContext } from "@/lib/auth/session";

const amount = (value: number) => new Prisma.Decimal(value);
const movement = (
  direction: "IN" | "OUT",
  channel: "CASH" | "BANK",
  value: number,
  recordStatus: "VALID" | "VOID" = "VALID",
) => ({ direction, channel, amount: amount(value), recordStatus });

describe("Cash Flow Payment formulas", () => {
  it("calculates cash on hand and bank balance from valid ledger rows", () => {
    const result = cashBalance([
      movement("IN", "CASH", 1000), movement("OUT", "CASH", 250),
      movement("IN", "BANK", 500), movement("OUT", "BANK", 100),
      movement("IN", "CASH", 999, "VOID"),
    ]);
    expect(result.cash.toString()).toBe("750");
    expect(result.bank.toString()).toBe("400");
  });

  it("calculates running balance without allowing void rows to affect it", () => {
    expect(runningBalances([
      movement("IN", "CASH", 1000),
      movement("OUT", "CASH", 300),
      movement("OUT", "CASH", 200, "VOID"),
      movement("IN", "BANK", 50),
    ]).map(String)).toEqual(["1000", "700", "700", "750"]);
  });

  it("represents bank deposit as equal cash out and bank in", () => {
    const result = cashBalance([
      movement("OUT", "CASH", 500),
      movement("IN", "BANK", 500),
    ]);
    expect(result.cash.toString()).toBe("-500");
    expect(result.bank.toString()).toBe("500");
  });
});

describe("Cash Flow Payment validation", () => {
  const base = {
    requestKey: "10000000-0000-4000-8000-000000000001",
    businessDate: "2026-07-30",
    occurredAt: "2026-07-30T03:00:00.000Z",
    channel: "CASH",
    amount: "100000",
    reference: "REF-1",
  };

  it("accepts manual income and manual expense", () => {
    expect(manualIncomeSchema.safeParse({ ...base, category: "Tambahan Modal" }).success).toBe(true);
    expect(manualExpenseSchema.safeParse({ ...base, category: "Tarik Cash Owner" }).success).toBe(true);
  });

  it.each(["0", "-1", "1.5", "1,000", "NaN"])("rejects non-positive or non-integer amount %s", (value) => {
    expect(manualIncomeSchema.safeParse({ ...base, amount: value, category: "Lainnya" }).success).toBe(false);
  });

  it("provides pagination defaults and accepts all filters", () => {
    const parsed = cashFlowListSchema.parse({
      startDate: "", endDate: "", direction: "IN", channel: "BANK",
      movementType: "PICKUP_PAYMENT", reference: "REF", search: "pickup",
    });
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(25);
  });
});

describe("Cash Flow Payment RBAC", () => {
  const session = (roles: string[]) => ({ roles, outletId: "outlet" } as SessionContext);

  it("allows Viewer to read only", () => {
    expect(canReadCashFlow(session(["VIEWER"]))).toBe(true);
    expect(canCreateManualCashFlow(session(["VIEWER"]))).toBe(false);
    expect(canManageManualCashFlow(session(["VIEWER"]))).toBe(false);
  });

  it("allows Operational to create but not edit or void", () => {
    expect(canCreateManualCashFlow(session(["OPERATIONAL"]))).toBe(true);
    expect(canManageManualCashFlow(session(["OPERATIONAL"]))).toBe(false);
  });

  it("allows Admin and Owner to manage manual movements", () => {
    expect(canManageManualCashFlow(session(["ADMIN"]))).toBe(true);
    expect(canManageManualCashFlow(session(["OWNER"]))).toBe(true);
  });
});
