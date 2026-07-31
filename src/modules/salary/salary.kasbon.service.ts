import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { SalaryError } from "./salary.api";
import { normalizeSalaryEmployeeName } from "./salary.calculation";
import { refreshClosingEmployeeTotals } from "./salary.closing.service";
import type { SalaryContext, SalaryScope } from "./salary.service";

const zero = () => new Prisma.Decimal(0);

export async function listEligibleSalaryKasbon(
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
      salaryClosing: true,
      employee: { include: { aliases: { where: { isActive: true } } } },
    },
  });
  if (!employee) throw new SalaryError("SALARY_SCOPE_MISMATCH", 404);
  const acceptedNames = new Set([
    normalizeSalaryEmployeeName(employee.employee.name),
    ...employee.employee.aliases.map((alias) =>
      normalizeSalaryEmployeeName(alias.aliasName)
    ),
  ]);
  const expenses = await prisma.operationalExpense.findMany({
    where: {
      tenantId: scope.tenantId,
      outletId: scope.outletId,
      operationalDate: {
        gte: employee.salaryClosing.periodStart,
        lte: employee.salaryClosing.periodEnd,
      },
      status: "VALID",
      category: { equals: "Kasbon", mode: "insensitive" },
      teamName: { not: null },
    },
    include: {
      salaryAllocations: {
        where: { status: { in: ["DRAFT", "FINALIZED"] } },
        select: { id: true, amount: true, salaryClosingEmployeeId: true },
      },
    },
    orderBy: { operationalDate: "asc" },
  });
  return expenses.flatMap((expense) => {
    if (!acceptedNames.has(normalizeSalaryEmployeeName(expense.teamName))) {
      return [];
    }
    const allocated = expense.salaryAllocations.reduce(
      (sum, allocation) => sum.plus(allocation.amount),
      zero(),
    );
    const remaining = Prisma.Decimal.max(expense.amount.minus(allocated), zero());
    return remaining.greaterThan(0)
      ? [{
        ...expense,
        allocatedAmount: allocated,
        remainingAmount: remaining,
        matchMethod: normalizeSalaryEmployeeName(expense.teamName) ===
          normalizeSalaryEmployeeName(employee.employee.name)
          ? "EXACT_NAME"
          : "ALIAS",
      }]
      : [];
  });
}

export async function saveSalaryKasbonAllocation(
  context: SalaryContext,
  input: {
    closingId: string;
    closingEmployeeId: string;
    operationalExpenseId: string;
    amount: number;
  },
) {
  return prisma.$transaction(async (tx) => {
    const employee = await tx.salaryClosingEmployee.findFirst({
      where: {
        id: input.closingEmployeeId,
        salaryClosingId: input.closingId,
        tenantId: context.tenantId,
        outletId: context.outletId,
      },
      include: {
        salaryClosing: true,
        employee: { include: { aliases: { where: { isActive: true } } } },
      },
    });
    if (!employee) throw new SalaryError("SALARY_SCOPE_MISMATCH", 404);
    if (employee.salaryClosing.status !== "CLOSED") {
      throw new SalaryError("SALARY_CLOSING_LOCKED", 409);
    }
    const expense = await tx.operationalExpense.findFirst({
      where: {
        id: input.operationalExpenseId,
        tenantId: context.tenantId,
        outletId: context.outletId,
        operationalDate: {
          gte: employee.salaryClosing.periodStart,
          lte: employee.salaryClosing.periodEnd,
        },
        status: "VALID",
        category: { equals: "Kasbon", mode: "insensitive" },
      },
    });
    if (!expense) throw new SalaryError("SALARY_KASBON_NOT_FOUND", 404);
    const acceptedNames = new Set([
      normalizeSalaryEmployeeName(employee.employee.name),
      ...employee.employee.aliases.map((alias) =>
        normalizeSalaryEmployeeName(alias.aliasName)
      ),
    ]);
    if (!acceptedNames.has(normalizeSalaryEmployeeName(expense.teamName))) {
      throw new SalaryError("SALARY_KASBON_NOT_FOUND", 404);
    }
    const amount = new Prisma.Decimal(String(input.amount));
    const reserved = await tx.salaryKasbonAllocation.aggregate({
      where: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        operationalExpenseId: expense.id,
        status: { in: ["DRAFT", "FINALIZED"] },
        NOT: { salaryClosingEmployeeId: employee.id },
      },
      _sum: { amount: true },
    });
    const available = expense.amount.minus(reserved._sum.amount ?? zero());
    if (amount.lessThanOrEqualTo(0) || amount.greaterThan(available)) {
      throw new SalaryError("SALARY_KASBON_EXCEEDS_REMAINING", 409);
    }
    const allocation = await tx.salaryKasbonAllocation.upsert({
      where: {
        salaryClosingEmployeeId_operationalExpenseId: {
          salaryClosingEmployeeId: employee.id,
          operationalExpenseId: expense.id,
        },
      },
      create: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        salaryClosingEmployeeId: employee.id,
        operationalExpenseId: expense.id,
        amount,
        status: "DRAFT",
        createdByUserId: context.actorId,
      },
      update: {
        amount,
        status: "DRAFT",
        voidedAt: null,
        voidedByUserId: null,
        voidReason: null,
      },
    });
    await refreshClosingEmployeeTotals(tx, context, employee.id);
    await tx.auditLog.create({
      data: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        actorId: context.actorId,
        action: "UPDATE",
        entityType: "SALARY_KASBON_ALLOCATION",
        entityId: allocation.id,
        metadata: {
          closingId: input.closingId,
          employeeId: employee.employeeId,
          kasbonId: expense.id,
          amount: amount.toString(),
        },
      },
    });
    return allocation;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function voidSalaryKasbonAllocation(
  context: SalaryContext,
  allocationId: string,
  reason: string,
) {
  return prisma.$transaction(async (tx) => {
    const allocation = await tx.salaryKasbonAllocation.findFirst({
      where: {
        id: allocationId,
        tenantId: context.tenantId,
        outletId: context.outletId,
        status: "DRAFT",
      },
      include: {
        closingEmployee: {
          include: { salaryClosing: { select: { status: true } } },
        },
      },
    });
    if (!allocation) throw new SalaryError("SALARY_KASBON_NOT_FOUND", 404);
    if (allocation.closingEmployee.salaryClosing.status !== "CLOSED") {
      throw new SalaryError("SALARY_CLOSING_LOCKED", 409);
    }
    const updated = await tx.salaryKasbonAllocation.update({
      where: { id: allocation.id },
      data: {
        status: "VOID",
        voidedAt: new Date(),
        voidedByUserId: context.actorId,
        voidReason: reason,
      },
    });
    await refreshClosingEmployeeTotals(
      tx,
      context,
      allocation.salaryClosingEmployeeId,
    );
    await tx.auditLog.create({
      data: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        actorId: context.actorId,
        action: "UPDATE",
        entityType: "VOID_SALARY_KASBON_ALLOCATION",
        entityId: allocation.id,
        metadata: {
          reason,
          amount: allocation.amount.toString(),
          kasbonId: allocation.operationalExpenseId,
        },
      },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateSalaryKasbonAllocation(
  context: SalaryContext,
  allocationId: string,
  amount: number,
) {
  const allocation = await prisma.salaryKasbonAllocation.findFirst({
    where: {
      id: allocationId,
      tenantId: context.tenantId,
      outletId: context.outletId,
      status: "DRAFT",
    },
    include: {
      closingEmployee: { select: { salaryClosingId: true } },
    },
  });
  if (!allocation) throw new SalaryError("SALARY_KASBON_NOT_FOUND", 404);
  return saveSalaryKasbonAllocation(context, {
    closingId: allocation.closingEmployee.salaryClosingId,
    closingEmployeeId: allocation.salaryClosingEmployeeId,
    operationalExpenseId: allocation.operationalExpenseId,
    amount,
  });
}
