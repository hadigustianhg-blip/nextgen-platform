import { describe, expect, it } from "vitest";
import {
  assertCourierPaymentInvariant,
  assertInvoiceInvariant,
  assertMasterSetoranInvariant,
  assertSalaryInvariant,
  buildMasterSetoranAmounts,
  buildPickupPaymentSeedScenarios,
} from "./seed-ui.helpers";

describe("development UI seed money invariants", () => {
  it("builds MasterSetoran using the exact database formula", () => {
    const amounts = buildMasterSetoranAmounts("550000.00");
    expect(amounts.dfodAmount.toFixed(2)).toBe("302500.00");
    expect(amounts.codCashAmount.toFixed(2)).toBe("247500.00");
    expect(amounts.codQrisAmount.toFixed(2)).toBe("24750.00");
    expect(amounts.dfodAmount.plus(amounts.codCashAmount).equals(amounts.totalSettlementAmount)).toBe(true);
  });

  it("keeps cent precision for totals that do not split evenly", () => {
    const amounts = buildMasterSetoranAmounts("550000.01");
    expect(amounts.dfodAmount.plus(amounts.codCashAmount).toFixed(2)).toBe("550000.01");
  });

  it("rejects the old formula that included COD QRIS independently", () => {
    expect(() => assertMasterSetoranInvariant({
      dfodAmount: 302500, codCashAmount: 192500, codQrisAmount: 55000, totalSettlementAmount: 550000,
    })).toThrow(/MasterSetoran_total_formula_check/);
  });

  it("validates related financial totals before writes", () => {
    expect(() => assertCourierPaymentInvariant({ cashAmount: 70, transferAmountSnapshot: 30, paidAmountSnapshot: 100 })).not.toThrow();
    expect(() => assertInvoiceInvariant({ subtotal: 100, discountTotal: 10, grandTotal: 90 })).not.toThrow();
    expect(() => assertSalaryInvariant({ systemIncomeTotal: 100, manualAdditionTotal: 20, manualDeductionTotal: 5, netSalary: 115 })).not.toThrow();
  });
});

describe("development Pickup Payment seed scenarios", () => {
  const scenarios = buildPickupPaymentSeedScenarios();

  it("creates deterministic DEVUI records eligible for the Pickup Payment cash-settlement filter", () => {
    expect(scenarios).toHaveLength(10);
    expect(new Set(scenarios.map((item) => item.waybill)).size).toBe(10);
    expect(scenarios.every((item) => item.waybill.startsWith("DEVUI-PICKPAY-") && item.settlementRaw === "Tunai")).toBe(true);
  });

  it("provides outstanding, partial, and paid scenarios with valid totals", () => {
    const outstanding = scenarios.filter((item) => item.paidAmount < item.freightAmount);
    const partial = scenarios.filter((item) => item.paidAmount > 0 && item.paidAmount < item.freightAmount);
    const paid = scenarios.filter((item) => item.paidAmount === item.freightAmount);
    expect(outstanding).toHaveLength(8);
    expect(partial).toHaveLength(3);
    expect(paid).toHaveLength(2);
    expect(scenarios.every((item) => item.paidAmount <= item.freightAmount)).toBe(true);
  });

  it("includes Cash and backward-compatible Transfer history without requiring a proof", () => {
    expect(scenarios.filter((item) => item.method === "CASH")).toHaveLength(3);
    expect(scenarios.filter((item) => item.method === "TRANSFER")).toHaveLength(2);
  });
});
