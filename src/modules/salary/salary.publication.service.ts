import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { SalaryError } from "./salary.api";
import type { SalaryScope } from "./salary.service";

const zero = () => new Prisma.Decimal(0);
const sumAmounts = (rows: Array<{ amount: Prisma.Decimal }>) =>
  rows.reduce((sum, row) => sum.plus(row.amount), zero());

export function normalizeSalaryWhatsappNumber(value: string | null | undefined) {
  if (!value?.trim()) return null;
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("08")) return `62${digits.slice(1)}`;
  if (digits.startsWith("628")) return digits;
  return digits;
}

export async function getSalaryRecapEmployeePublication(
  scope: SalaryScope,
  closingId: string,
  closingEmployeeId: string,
) {
  const employee = await prisma.salaryClosingEmployee.findFirst({
    where: {
      id: closingEmployeeId,
      salaryClosingId: closingId,
      tenantId: scope.tenantId,
      outletId: scope.outletId,
    },
    include: {
      salaryClosing: {
        select: {
          id: true,
          closingNumber: true,
          periodStart: true,
          periodEnd: true,
          status: true,
          processedAt: true,
          tenant: { select: { name: true } },
          outlet: { select: { name: true, code: true } },
        },
      },
      components: {
        where: { componentType: "INCOME" },
        select: {
          id: true,
          componentCode: true,
          componentName: true,
          quantity: true,
          rate: true,
          amount: true,
        },
        orderBy: { componentName: "asc" },
      },
      adjustments: {
        where: { voidedAt: null },
        select: {
          id: true,
          type: true,
          category: true,
          amount: true,
          reason: true,
        },
        orderBy: { createdAt: "asc" },
      },
      kasbonAllocations: {
        where: { status: "FINALIZED" },
        select: {
          id: true,
          amount: true,
          kasbonSnapshot: {
            select: { operationalDate: true, description: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      calculationSnapshot: {
        select: {
          systemIncomeTotal: true,
          manualAdditionTotal: true,
          manualDeductionTotal: true,
          netSalary: true,
        },
      },
      employee: { select: { whatsapp: true } },
    },
  });
  if (!employee) throw new SalaryError("SALARY_PUBLICATION_NOT_FOUND", 404);
  if (!["PROCESSED", "PAID"].includes(employee.salaryClosing.status)) {
    throw new SalaryError("SALARY_PUBLICATION_NOT_AVAILABLE", 409);
  }
  const employeeSnapshot = await prisma.salaryEmployeeSnapshot.findFirst({
    where: {
      salaryClosingId: closingId,
      salaryEmployeeId: employee.employeeId,
      tenantId: scope.tenantId,
      outletId: scope.outletId,
    },
    select: { whatsapp: true },
  });

  const additions = employee.adjustments.filter((row) => row.type === "ADDITION");
  const deductions = employee.adjustments.filter((row) => row.type === "DEDUCTION");
  const componentTotal = sumAmounts(employee.components);
  const additionTotal = sumAmounts(additions);
  const manualDeductionTotal = sumAmounts(deductions);
  const kasbonTotal = sumAmounts(employee.kasbonAllocations);
  const totalIncome = employee.systemIncomeTotal.plus(employee.manualAdditionTotal);
  const totalDeduction = manualDeductionTotal.plus(kasbonTotal);
  const expectedNet = totalIncome.minus(totalDeduction);
  const calculation = employee.calculationSnapshot;
  const consistent = componentTotal.equals(employee.systemIncomeTotal) &&
    additionTotal.equals(employee.manualAdditionTotal) &&
    totalDeduction.equals(employee.manualDeductionTotal) &&
    expectedNet.equals(employee.netSalary) &&
    calculation != null &&
    calculation.systemIncomeTotal.equals(employee.systemIncomeTotal);
  if (!consistent) {
    throw new SalaryError("SALARY_PUBLICATION_INCONSISTENT", 409);
  }

  const tenantName = employee.salaryClosing.tenant.name.trim();
  const outletName = employee.salaryClosing.outlet.name.trim();
  const outletCode = employee.salaryClosing.outlet.code;
  const brandName = tenantName || outletName || `J&T CARGO ${outletCode}`;
  const whatsappRaw = employeeSnapshot?.whatsapp ??
    employee.whatsappSnapshot ??
    employee.employee.whatsapp ??
    null;

  return {
    closing: {
      id: employee.salaryClosing.id,
      closingNumber: employee.salaryClosing.closingNumber,
      periodStart: employee.salaryClosing.periodStart,
      periodEnd: employee.salaryClosing.periodEnd,
      status: employee.salaryClosing.status,
      processedAt: employee.salaryClosing.processedAt,
    },
    identity: {
      brandName,
      outletName: outletName || null,
      outletCode,
    },
    employee: {
      id: employee.id,
      name: employee.employeeNameSnapshot,
      division: employee.divisionSnapshot,
      workDayCount: employee.workDayCount,
      pickupCount: employee.sourcePickupCount,
      dispatchCount: employee.sourceDispatchCount,
      whatsappRaw,
      whatsappNormalized: normalizeSalaryWhatsappNumber(whatsappRaw),
    },
    components: employee.components,
    additions,
    deductions,
    kasbonAllocations: employee.kasbonAllocations,
    totals: {
      systemIncome: employee.systemIncomeTotal,
      addition: employee.manualAdditionTotal,
      manualDeduction: manualDeductionTotal,
      kasbon: kasbonTotal,
      totalIncome,
      totalDeduction,
      netSalary: employee.netSalary,
    },
    publicationStatus: "READY" as const,
  };
}
