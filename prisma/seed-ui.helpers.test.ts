import { describe, expect, it } from "vitest";
import {
  assertCourierPaymentInvariant,
  assertInvoiceInvariant,
  assertMasterSetoranInvariant,
  assertSalaryInvariant,
  buildMasterSetoranAmounts,
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
