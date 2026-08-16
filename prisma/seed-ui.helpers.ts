import { Prisma } from "@prisma/client";

const money = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value).toDecimalPlaces(2);

function assertEqual(label: string, actual: Prisma.Decimal, expected: Prisma.Decimal) {
  if (!actual.equals(expected)) {
    throw new Error(`${label} invariant failed: ${actual.toFixed(2)} !== ${expected.toFixed(2)}`);
  }
}

export function buildMasterSetoranAmounts(totalValue: Prisma.Decimal.Value) {
  const totalSettlementAmount = money(totalValue);
  if (totalSettlementAmount.isNegative()) throw new Error("MasterSetoran total must be non-negative.");

  const dfodAmount = totalSettlementAmount.mul("0.55").toDecimalPlaces(2);
  // The database constraint intentionally excludes codQrisAmount from the total formula.
  const codCashAmount = totalSettlementAmount.minus(dfodAmount).toDecimalPlaces(2);
  const codQrisAmount = codCashAmount.mul("0.10").toDecimalPlaces(2);

  assertMasterSetoranInvariant({ dfodAmount, codCashAmount, codQrisAmount, totalSettlementAmount });
  return { dfodAmount, codCashAmount, codQrisAmount, totalSettlementAmount };
}

export function assertMasterSetoranInvariant(input: {
  dfodAmount: Prisma.Decimal.Value;
  codCashAmount: Prisma.Decimal.Value;
  codQrisAmount: Prisma.Decimal.Value;
  totalSettlementAmount: Prisma.Decimal.Value;
}) {
  const dfod = money(input.dfodAmount);
  const codCash = money(input.codCashAmount);
  const codQris = money(input.codQrisAmount);
  const total = money(input.totalSettlementAmount);
  if ([dfod, codCash, codQris, total].some((value) => value.isNegative())) {
    throw new Error("MasterSetoran amounts must be non-negative.");
  }
  assertEqual("MasterSetoran_total_formula_check", total, dfod.plus(codCash));
}

export function assertCourierPaymentInvariant(input: {
  cashAmount: Prisma.Decimal.Value;
  transferAmountSnapshot: Prisma.Decimal.Value;
  paidAmountSnapshot: Prisma.Decimal.Value;
}) {
  const cash = money(input.cashAmount);
  const transfer = money(input.transferAmountSnapshot);
  const paid = money(input.paidAmountSnapshot);
  if ([cash, transfer, paid].some((value) => value.isNegative())) {
    throw new Error("Courier settlement payment amounts must be non-negative.");
  }
  assertEqual("CourierSettlementPayment_snapshot_formula_check", paid, cash.plus(transfer));
}

export function assertInvoiceInvariant(input: {
  subtotal: Prisma.Decimal.Value;
  discountTotal: Prisma.Decimal.Value;
  grandTotal: Prisma.Decimal.Value;
}) {
  const subtotal = money(input.subtotal);
  const discount = money(input.discountTotal);
  const grandTotal = money(input.grandTotal);
  if ([subtotal, discount, grandTotal].some((value) => value.isNegative())) {
    throw new Error("Invoice totals must be non-negative.");
  }
  assertEqual("Invoice total", grandTotal, subtotal.minus(discount));
}

export function assertSalaryInvariant(input: {
  systemIncomeTotal: Prisma.Decimal.Value;
  manualAdditionTotal: Prisma.Decimal.Value;
  manualDeductionTotal: Prisma.Decimal.Value;
  netSalary: Prisma.Decimal.Value;
}) {
  const income = money(input.systemIncomeTotal);
  const addition = money(input.manualAdditionTotal);
  const deduction = money(input.manualDeductionTotal);
  const net = money(input.netSalary);
  if ([income, addition, deduction].some((value) => value.isNegative())) {
    throw new Error("Salary source totals must be non-negative.");
  }
  assertEqual("Salary net total", net, income.plus(addition).minus(deduction));
}
