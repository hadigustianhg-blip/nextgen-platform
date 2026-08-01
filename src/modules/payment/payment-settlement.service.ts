import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { channelBalances } from "./cash-flow.service";

type Scope = { tenantId: string; outletId: string };
const zero = () => new Prisma.Decimal(0);
const dateValue = (value: string) => new Date(`${value}T00:00:00.000Z`);
const dateString = (value: Date) => value.toISOString().slice(0, 10);

type Movement = {
  businessDate: string; direction: "IN" | "OUT"; channel: "CASH" | "BANK";
  movementType: string; amount: Prisma.Decimal; recordStatus: "VALID" | "VOID";
};
type Receivable = {
  businessDate: string;
  obligation: Prisma.Decimal;
  payments: Array<{ paymentDate: string; amount: Prisma.Decimal; status: string }>;
};
type Closing = {
  businessDate: string; status: "OPEN" | "REOPENED" | "CLOSED";
  physicalCash: Prisma.Decimal; cashVariance: Prisma.Decimal;
};

export function settlementBalances(groups: Array<{
  channel: "CASH" | "BANK"; direction: "IN" | "OUT"; amount: Prisma.Decimal;
}>) {
  const balances = channelBalances(groups);
  return { cashOnHand: balances.cash, bankBalance: balances.bank };
}

export function periodBankDeposit(movements: Movement[]) {
  return movements.filter((row) =>
    row.recordStatus === "VALID" && row.channel === "CASH" &&
    row.direction === "OUT" && row.movementType === "BANK_DEPOSIT")
    .reduce((sum, row) => sum.plus(row.amount), zero());
}

export function periodBankBalance(
  movements: Movement[],
  periodStart: string,
  periodEnd: string,
) {
  return settlementBalances(
    movements
      .filter((row) =>
        row.recordStatus === "VALID" && row.channel === "BANK"
        && row.businessDate >= periodStart && row.businessDate <= periodEnd)
      .map((row) => ({
        channel: row.channel,
        direction: row.direction,
        amount: row.amount,
      })),
  ).bankBalance;
}

export function periodOperationalTotals(movements: Movement[]) {
  const valid = movements.filter((row) => row.recordStatus === "VALID");
  const receivedTypes = ["PICKUP_PAYMENT", "DELIVERY_PAYMENT"];
  return {
    cashReceived: valid.filter((row) =>
      row.direction === "IN" && row.channel === "CASH" && receivedTypes.includes(row.movementType))
      .reduce((sum, row) => sum.plus(row.amount), zero()),
    transferReceived: valid.filter((row) =>
      row.direction === "IN" && row.channel === "BANK" && receivedTypes.includes(row.movementType))
      .reduce((sum, row) => sum.plus(row.amount), zero()),
    operationalExpense: valid.filter((row) =>
      row.direction === "OUT" && row.channel === "CASH" && row.movementType === "OPERATIONAL_EXPENSE")
      .reduce((sum, row) => sum.plus(row.amount), zero()),
  };
}

export function outstandingAsOf(rows: Receivable[], asOf: string) {
  return rows.reduce((total, row) => {
    if (row.businessDate > asOf) return total;
    const paid = row.payments
      .filter((payment) => payment.status === "VALID" && payment.paymentDate <= asOf)
      .reduce((sum, payment) => sum.plus(payment.amount), zero());
    return total.plus(Prisma.Decimal.max(row.obligation.minus(paid), zero()));
  }, zero());
}

export function calculateSettlementPeriod(input: {
  periodStart: string;
  periodEnd: string;
  openingCash: Prisma.Decimal;
  movements: Movement[];
  pickups: Receivable[];
  deliveries: Receivable[];
  closings: Closing[];
  closingStatus?: string;
}) {
  const validCash = input.movements.filter((row) =>
    row.recordStatus === "VALID" && row.channel === "CASH" &&
    row.businessDate >= input.periodStart && row.businessDate <= input.periodEnd);
  const closingByDate = new Map(input.closings.map((row) => [row.businessDate, row]));
  const dates = new Set<string>([
    ...validCash.map((row) => row.businessDate),
    ...input.pickups.map((row) => row.businessDate).filter((date) => date >= input.periodStart && date <= input.periodEnd),
    ...input.deliveries.map((row) => row.businessDate).filter((date) => date >= input.periodStart && date <= input.periodEnd),
    ...input.closings.map((row) => row.businessDate).filter((date) => date >= input.periodStart && date <= input.periodEnd),
  ]);
  let runningCash = input.openingCash;
  const rows = [...dates].sort().map((businessDate) => {
    const day = validCash.filter((row) => row.businessDate === businessDate);
    const cashIn = day.filter((row) => row.direction === "IN").reduce((sum, row) => sum.plus(row.amount), zero());
    const operationalExpense = day.filter((row) => row.direction === "OUT" && row.movementType === "OPERATIONAL_EXPENSE").reduce((sum, row) => sum.plus(row.amount), zero());
    const bankDeposit = day.filter((row) => row.direction === "OUT" && row.movementType === "BANK_DEPOSIT").reduce((sum, row) => sum.plus(row.amount), zero());
    const cashWithdrawal = day.filter((row) => row.direction === "OUT" && row.movementType === "CASH_WITHDRAWAL").reduce((sum, row) => sum.plus(row.amount), zero());
    const otherCashOut = day.filter((row) =>
      row.direction === "OUT" && !["OPERATIONAL_EXPENSE", "BANK_DEPOSIT", "CASH_WITHDRAWAL"].includes(row.movementType))
      .reduce((sum, row) => sum.plus(row.amount), zero());
    const openingCash = runningCash;
    runningCash = runningCash.plus(cashIn).minus(operationalExpense).minus(bankDeposit).minus(cashWithdrawal).minus(otherCashOut);
    const closing = closingByDate.get(businessDate);
    const closingStatus = closing?.status ?? "BELUM_CLOSING";
    const cashInBreakdown = {
      pickupCash: day.filter((row) => row.direction === "IN" && row.movementType === "PICKUP_PAYMENT").reduce((sum, row) => sum.plus(row.amount), zero()),
      deliveryCash: day.filter((row) => row.direction === "IN" && row.movementType === "DELIVERY_PAYMENT").reduce((sum, row) => sum.plus(row.amount), zero()),
      manualIncome: day.filter((row) => row.direction === "IN" && row.movementType === "MANUAL_INCOME").reduce((sum, row) => sum.plus(row.amount), zero()),
      refund: day.filter((row) => row.direction === "IN" && row.movementType === "REFUND").reduce((sum, row) => sum.plus(row.amount), zero()),
      adjustmentIn: day.filter((row) => row.direction === "IN" && row.movementType === "ADJUSTMENT").reduce((sum, row) => sum.plus(row.amount), zero()),
      other: day.filter((row) => row.direction === "IN" && !["PICKUP_PAYMENT", "DELIVERY_PAYMENT", "MANUAL_INCOME", "REFUND", "ADJUSTMENT"].includes(row.movementType)).reduce((sum, row) => sum.plus(row.amount), zero()),
    };
    const cashOutBreakdown = {
      operationalExpense, bankDeposit, cashWithdrawal,
      manualExpense: day.filter((row) => row.direction === "OUT" && row.movementType === "MANUAL_EXPENSE").reduce((sum, row) => sum.plus(row.amount), zero()),
      adjustmentOut: day.filter((row) => row.direction === "OUT" && row.movementType === "ADJUSTMENT").reduce((sum, row) => sum.plus(row.amount), zero()),
      other: day.filter((row) => row.direction === "OUT" && !["OPERATIONAL_EXPENSE", "BANK_DEPOSIT", "CASH_WITHDRAWAL", "MANUAL_EXPENSE", "ADJUSTMENT"].includes(row.movementType)).reduce((sum, row) => sum.plus(row.amount), zero()),
    };
    return {
      businessDate, openingCash, cashIn, cashPayment: cashIn, operationalExpense,
      bankDeposit, cashWithdrawal, otherCashOut,
      totalCashOut: operationalExpense.plus(bankDeposit).plus(cashWithdrawal).plus(otherCashOut),
      closingCash: runningCash,
      pickupOutstanding: outstandingAsOf(input.pickups, businessDate),
      deliveryOutstanding: outstandingAsOf(input.deliveries, businessDate),
      closingStatus, physicalCash: closing?.physicalCash ?? null,
      cashVariance: closing?.cashVariance ?? null, cashInBreakdown, cashOutBreakdown,
    };
  });
  return rows.filter((row) => !input.closingStatus || row.closingStatus === input.closingStatus);
}

function serializeDaily(row: ReturnType<typeof calculateSettlementPeriod>[number]) {
  return {
    ...row,
    openingCash: row.openingCash.toString(), cashIn: row.cashIn.toString(),
    cashPayment: row.cashPayment.toString(), operationalExpense: row.operationalExpense.toString(),
    bankDeposit: row.bankDeposit.toString(), cashWithdrawal: row.cashWithdrawal.toString(),
    otherCashOut: row.otherCashOut.toString(), totalCashOut: row.totalCashOut.toString(),
    closingCash: row.closingCash.toString(),
    pickupOutstanding: row.pickupOutstanding.toString(), deliveryOutstanding: row.deliveryOutstanding.toString(),
    physicalCash: row.physicalCash?.toString() ?? null, cashVariance: row.cashVariance?.toString() ?? null,
    cashInBreakdown: Object.fromEntries(Object.entries(row.cashInBreakdown).map(([key, value]) => [key, value.toString()])),
    cashOutBreakdown: Object.fromEntries(Object.entries(row.cashOutBreakdown).map(([key, value]) => [key, value.toString()])),
  };
}

export async function getPaymentSettlement(
  scope: Scope,
  input: { month: number; year: number; closingStatus?: string },
) {
  const periodStart = `${input.year}-${String(input.month).padStart(2, "0")}-01`;
  const nextMonth = input.month === 12 ? `${input.year + 1}-01-01` : `${input.year}-${String(input.month + 1).padStart(2, "0")}-01`;
  const periodEndDate = new Date(dateValue(nextMonth).valueOf() - 86_400_000);
  const periodEnd = dateString(periodEndDate);
  const whereScope = { tenantId: scope.tenantId, outletId: scope.outletId };
  const [globalCashGroups, opening, movements, pickups, deliveries, closings] = await Promise.all([
    prisma.cashMovement.groupBy({
      by: ["channel", "direction", "movementType"],
      where: { ...whereScope, recordStatus: "VALID", channel: "CASH" },
      _sum: { amount: true },
    }),
    prisma.cashMovement.groupBy({
      by: ["direction"],
      where: { ...whereScope, recordStatus: "VALID", channel: "CASH", businessDate: { lt: dateValue(periodStart) } },
      _sum: { amount: true },
    }),
    prisma.cashMovement.findMany({
      where: { ...whereScope, businessDate: { gte: dateValue(periodStart), lte: periodEndDate } },
      select: { businessDate: true, direction: true, channel: true, movementType: true, amount: true, recordStatus: true },
      orderBy: [{ businessDate: "asc" }, { occurredAt: "asc" }],
    }),
    prisma.masterPickup.findMany({
      where: whereScope,
      select: {
        operationalDate: true, freightAmount: true,
        settlementRevisions: { where: { recordStatus: "VALID" }, orderBy: { revision: "desc" }, take: 1, select: { discountAmount: true } },
        payments: { select: { paymentDate: true, receivedAmount: true, recordStatus: true } },
      },
    }),
    prisma.masterSetoran.findMany({
      where: whereScope,
      select: {
        operationalDate: true, dfodAmount: true, codCashAmount: true,
        payments: { select: { paymentDate: true, paidAmountSnapshot: true, recordStatus: true } },
      },
    }),
    prisma.operationalClosing.findMany({
      where: { ...whereScope, operationalDate: { gte: dateValue(periodStart), lte: periodEndDate } },
      select: { operationalDate: true, status: true, physicalCash: true, cashVariance: true },
    }),
  ]);
  const globalBalance = settlementBalances(globalCashGroups.map((row) => ({
    channel: row.channel, direction: row.direction, amount: row._sum.amount ?? zero(),
  })));
  const pickupRows: Receivable[] = pickups.map((row) => ({
    businessDate: dateString(row.operationalDate),
    obligation: row.freightAmount.minus(row.settlementRevisions[0]?.discountAmount ?? zero()),
    payments: row.payments.map((payment) => ({ paymentDate: dateString(payment.paymentDate), amount: payment.receivedAmount, status: payment.recordStatus })),
  }));
  const deliveryRows: Receivable[] = deliveries.map((row) => ({
    businessDate: dateString(row.operationalDate),
    obligation: row.dfodAmount.plus(row.codCashAmount),
    payments: row.payments.map((payment) => ({ paymentDate: dateString(payment.paymentDate), amount: payment.paidAmountSnapshot, status: payment.recordStatus })),
  }));
  const movementRows: Movement[] = movements.map((row) => ({ ...row, businessDate: dateString(row.businessDate) }));
  const operational = periodOperationalTotals(movementRows);
  const bankBalance = periodBankBalance(movementRows, periodStart, periodEnd);
  const openingCash = opening.reduce((sum, row) => {
    const amount = row._sum.amount ?? zero();
    return row.direction === "IN" ? sum.plus(amount) : sum.minus(amount);
  }, zero());
  const daily = calculateSettlementPeriod({
    periodStart, periodEnd, openingCash, movements: movementRows, pickups: pickupRows, deliveries: deliveryRows,
    closings: closings.map((row) => ({ ...row, businessDate: dateString(row.operationalDate) })),
    closingStatus: input.closingStatus,
  });
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
  return {
    summary: {
      cashOnHand: globalBalance.cashOnHand.toString(),
      bankBalance: bankBalance.toString(),
      operationalCashReceived: operational.cashReceived.toString(),
      operationalTransferReceived: operational.transferReceived.toString(),
      operationalExpense: operational.operationalExpense.toString(),
      pickupOutstanding: outstandingAsOf(pickupRows, today).toString(),
      deliveryOutstanding: outstandingAsOf(deliveryRows, today).toString(),
      bankDepositThisMonth: periodBankDeposit(movementRows).toString(),
    },
    dailyRows: daily.slice().reverse().map(serializeDaily),
    period: { month: input.month, year: input.year, startDate: periodStart, endDate: periodEnd, totalDays: daily.length },
  };
}

export async function getPaymentSettlementDay(scope: Scope, businessDate: string) {
  const date = dateValue(businessDate);
  const result = await getPaymentSettlement(scope, {
    month: date.getUTCMonth() + 1, year: date.getUTCFullYear(),
  });
  return result.dailyRows.find((row) => row.businessDate === businessDate) ?? null;
}
