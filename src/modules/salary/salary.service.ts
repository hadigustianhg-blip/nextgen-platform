import "server-only";
import {
  Prisma,
  SalaryDivision,
  SalaryEmployeeStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  SALARY_DELIVERY_SOURCE,
  SALARY_DISPATCH_STATUS,
  SALARY_PICKUP_SOURCE,
} from "./salary.domain";
import { SalaryError } from "./salary.api";
import { refreshClosingEmployeeTotals } from "./salary.closing.service";
import { normalizeSalaryEmployeeName } from "./salary.calculation";

export type SalaryScope = { tenantId: string; outletId: string };
export type SalaryContext = SalaryScope & {
  actorId: string;
  outletCode: string;
};

type ProfileInput = {
  code: string;
  name: string;
  division: SalaryDivision;
  description?: string | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  version: number;
  basicDailySalary?: number | null;
  overtimeRate?: number | null;
  fixedAllowance?: number | null;
  deliveryPerKgAmount?: number | null;
  deliveryPerKgMinWeight?: number | null;
  deliveryPerKgMaxWeight?: number | null;
  deliveryPerWaybillAmount?: number | null;
  deliveryPerWaybillMinWeight?: number | null;
  deliveryPerWaybillMaxWeight?: number | null;
  pickupRegularRevenuePercentage?: number | null;
  pickupRegularPerWaybillAmount?: number | null;
  pickupMarketplacePerWaybillAmount?: number | null;
  dailyFuelMinDeliveryWaybill?: number | null;
  dailyFuelAmount?: number | null;
  dailyExtraMinDeliveryWaybill?: number | null;
  dailyExtraAmount?: number | null;
};

const calendarDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const decimal = (value: number | null | undefined) =>
  value == null ? null : new Prisma.Decimal(String(value));

const settingData = (scope: SalaryScope, input: ProfileInput) => ({
  tenantId: scope.tenantId,
  outletId: scope.outletId,
  basicDailySalary: decimal(input.basicDailySalary),
  overtimeRate: decimal(input.overtimeRate),
  fixedAllowance: decimal(input.fixedAllowance),
  deliveryPerKgAmount: decimal(input.deliveryPerKgAmount),
  deliveryPerKgMinWeight: decimal(input.deliveryPerKgMinWeight),
  deliveryPerKgMaxWeight: decimal(input.deliveryPerKgMaxWeight),
  deliveryPerWaybillAmount: decimal(input.deliveryPerWaybillAmount),
  deliveryPerWaybillMinWeight: decimal(input.deliveryPerWaybillMinWeight),
  deliveryPerWaybillMaxWeight: decimal(input.deliveryPerWaybillMaxWeight),
  pickupRegularRevenuePercentage: decimal(
    input.pickupRegularRevenuePercentage,
  ),
  pickupRegularPerWaybillAmount: decimal(
    input.pickupRegularPerWaybillAmount,
  ),
  pickupMarketplacePerWaybillAmount: decimal(
    input.pickupMarketplacePerWaybillAmount,
  ),
  dailyFuelMinDeliveryWaybill: input.dailyFuelMinDeliveryWaybill ?? null,
  dailyFuelAmount: decimal(input.dailyFuelAmount),
  dailyExtraMinDeliveryWaybill: input.dailyExtraMinDeliveryWaybill ?? null,
  dailyExtraAmount: decimal(input.dailyExtraAmount),
  deliverySource: SALARY_DELIVERY_SOURCE,
  pickupSource: SALARY_PICKUP_SOURCE,
  dispatchRequiredStatus: SALARY_DISPATCH_STATUS,
});

const salarySettingAuditKeys = [
  "basicDailySalary",
  "overtimeRate",
  "fixedAllowance",
  "deliveryPerKgAmount",
  "deliveryPerKgMinWeight",
  "deliveryPerKgMaxWeight",
  "deliveryPerWaybillAmount",
  "deliveryPerWaybillMinWeight",
  "deliveryPerWaybillMaxWeight",
  "pickupRegularRevenuePercentage",
  "pickupRegularPerWaybillAmount",
  "pickupMarketplacePerWaybillAmount",
  "dailyFuelMinDeliveryWaybill",
  "dailyFuelAmount",
  "dailyExtraMinDeliveryWaybill",
  "dailyExtraAmount",
] as const;

function settingAuditData(value: object | null | undefined) {
  const record = (value ?? {}) as Record<string, unknown>;
  return Object.fromEntries(salarySettingAuditKeys.map((key) => {
    const current = record[key];
    return [key, current == null
      ? null
      : typeof current === "object"
        ? String(current)
        : current];
  }));
}

const profileInclude = { setting: true } as const;

export async function listSalaryProfiles(scope: SalaryScope) {
  return prisma.salaryProfile.findMany({
    where: { tenantId: scope.tenantId, outletId: scope.outletId },
    include: profileInclude,
    orderBy: [{ effectiveFrom: "desc" }, { code: "asc" }, { version: "desc" }],
  });
}

export async function getSalaryProfile(scope: SalaryScope, id: string) {
  return prisma.salaryProfile.findFirst({
    where: { id, tenantId: scope.tenantId, outletId: scope.outletId },
    include: profileInclude,
  });
}

export async function createSalaryProfile(
  context: SalaryContext,
  input: ProfileInput,
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const profile = await tx.salaryProfile.create({
        data: {
          tenantId: context.tenantId,
          outletId: context.outletId,
          code: input.code,
          name: input.name,
          division: input.division,
          description: input.description || null,
          effectiveFrom: calendarDate(input.effectiveFrom),
          effectiveTo: input.effectiveTo
            ? calendarDate(input.effectiveTo)
            : null,
          version: input.version,
          status: "DRAFT",
          createdByUserId: context.actorId,
        },
      });
      await tx.salaryProfileSetting.create({
        data: {
          salaryProfileId: profile.id,
          ...settingData(context, input),
        },
      });
      await tx.auditLog.create({ data: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        actorId: context.actorId,
        action: "CREATE",
        entityType: "SALARY_PROFILE",
        entityId: profile.id,
        metadata: {
          code: profile.code,
          version: profile.version,
          division: profile.division,
        },
      } });
      return tx.salaryProfile.findUniqueOrThrow({
        where: { id: profile.id },
        include: profileInclude,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new SalaryError("SALARY_PROFILE_CONFLICT", 409);
    }
    if (error instanceof SalaryError) throw error;
    throw new SalaryError("SALARY_SAVE_FAILED", 500);
  }
}

export async function updateSalaryProfile(
  context: SalaryContext,
  id: string,
  input: ProfileInput,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.salaryProfile.findFirst({
      where: {
        id,
        tenantId: context.tenantId,
        outletId: context.outletId,
      },
      include: { setting: true },
    });
    if (!existing) throw new SalaryError("SALARY_PROFILE_NOT_FOUND", 404);
    if (!["DRAFT", "ACTIVE"].includes(existing.status)) {
      throw new SalaryError("SALARY_PROFILE_CONFLICT", 409);
    }
    const finalizedSnapshot = await tx.salaryClosingProfileSnapshot.findFirst({
      where: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        salaryProfileId: existing.id,
        salaryClosing: {
          status: { in: ["CLOSED", "PROCESSED", "PAID"] },
        },
      },
      select: { id: true },
    });
    if (finalizedSnapshot) {
      throw new SalaryError("SALARY_PROFILE_FINALIZED", 409);
    }
    await tx.salaryProfile.update({
      where: { id: existing.id },
      data: {
        code: input.code,
        name: input.name,
        division: input.division,
        description: input.description || null,
        effectiveFrom: calendarDate(input.effectiveFrom),
        effectiveTo: input.effectiveTo
          ? calendarDate(input.effectiveTo)
          : null,
        version: input.version,
      },
    });
    await tx.salaryProfileSetting.upsert({
      where: { salaryProfileId: existing.id },
      create: {
        salaryProfileId: existing.id,
        ...settingData(context, input),
      },
      update: settingData(context, input),
    });
    await tx.auditLog.create({ data: {
      tenantId: context.tenantId,
      outletId: context.outletId,
      actorId: context.actorId,
      action: "UPDATE",
      entityType: "SALARY_PROFILE",
      entityId: existing.id,
      metadata: {
        previous: {
          code: existing.code,
          name: existing.name,
          division: existing.division,
          description: existing.description,
          effectiveFrom: existing.effectiveFrom,
          effectiveTo: existing.effectiveTo,
          version: existing.version,
        },
        changed: {
          code: input.code,
          name: input.name,
          division: input.division,
          description: input.description || null,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo || null,
          version: input.version,
        },
        previousSetting: settingAuditData(existing.setting),
        changedSetting: settingAuditData(input),
      },
    } });
    return tx.salaryProfile.findUniqueOrThrow({
      where: { id: existing.id },
      include: profileInclude,
    });
  });
}

export async function activateSalaryProfile(
  context: SalaryContext,
  id: string,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.salaryProfile.findFirst({
      where: {
        id,
        tenantId: context.tenantId,
        outletId: context.outletId,
      },
    });
    if (!existing) throw new SalaryError("SALARY_PROFILE_NOT_FOUND", 404);
    const profile = await tx.salaryProfile.update({
      where: { id: existing.id },
      data: { status: "ACTIVE" },
      include: profileInclude,
    });
    await tx.auditLog.create({ data: {
      tenantId: context.tenantId,
      outletId: context.outletId,
      actorId: context.actorId,
      action: "UPDATE",
      entityType: "ACTIVATE_SALARY_PROFILE",
      entityId: existing.id,
      metadata: {
        previousStatus: existing.status,
        nextStatus: "ACTIVE",
        code: existing.code,
        version: existing.version,
      },
    } });
    return profile;
  });
}

export async function listSalaryTeam(
  scope: SalaryScope,
  input: {
    search?: string;
    division?: SalaryDivision | "";
    status?: SalaryEmployeeStatus | "";
  } = {},
) {
  return prisma.salaryEmployee.findMany({
    where: {
      tenantId: scope.tenantId,
      outletId: scope.outletId,
      ...(input.search
        ? { name: { contains: input.search, mode: "insensitive" } }
        : {}),
      ...(input.division ? { division: input.division } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
    include: {
      assignments: {
        where: { status: "ACTIVE" },
        include: { salaryProfile: true },
        orderBy: { effectiveFrom: "desc" },
        take: 1,
      },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
}

export async function listSalaryEmployeeAliases(scope: SalaryScope) {
  return prisma.salaryEmployeeAlias.findMany({
    where: {
      tenantId: scope.tenantId,
      outletId: scope.outletId,
      isActive: true,
    },
    include: { employee: { select: { name: true } } },
    orderBy: [{ aliasName: "asc" }, { sourceType: "asc" }],
  });
}

export async function createSalaryEmployeeAlias(
  context: SalaryContext,
  input: {
    salaryEmployeeId: string;
    sourceType: "PICKUP" | "DISPATCH" | "BOTH";
    aliasName: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    const employee = await tx.salaryEmployee.findFirst({
      where: {
        id: input.salaryEmployeeId,
        tenantId: context.tenantId,
        outletId: context.outletId,
      },
    });
    if (!employee) throw new SalaryError("SALARY_EMPLOYEE_NOT_FOUND", 404);
    const normalizedAlias = normalizeSalaryEmployeeName(input.aliasName);
    const sourceTypes = input.sourceType === "BOTH"
      ? ["PICKUP", "DISPATCH", "BOTH"] as const
      : [input.sourceType, "BOTH"] as const;
    const conflict = await tx.salaryEmployeeAlias.findFirst({
      where: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        normalizedAlias,
        isActive: true,
        sourceType: { in: [...sourceTypes] },
      },
    });
    if (conflict) throw new SalaryError("SALARY_ALIAS_CONFLICT", 409);
    const alias = await tx.salaryEmployeeAlias.create({
      data: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        salaryEmployeeId: employee.id,
        sourceType: input.sourceType,
        aliasName: input.aliasName,
        normalizedAlias,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        actorId: context.actorId,
        action: "CREATE",
        entityType: "SALARY_EMPLOYEE_ALIAS",
        entityId: alias.id,
        metadata: {
          employeeId: employee.id,
          sourceType: input.sourceType,
          aliasName: input.aliasName,
        },
      },
    });
    return alias;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createSalaryEmployee(
  context: SalaryContext,
  input: {
    name: string;
    division: SalaryDivision;
    whatsapp?: string | null;
    status: SalaryEmployeeStatus;
  },
) {
  return prisma.$transaction(async (tx) => {
    const employee = await tx.salaryEmployee.create({ data: {
      tenantId: context.tenantId,
      outletId: context.outletId,
      name: input.name,
      division: input.division,
      whatsapp: input.whatsapp || null,
      status: input.status,
    } });
    await tx.auditLog.create({ data: {
      tenantId: context.tenantId,
      outletId: context.outletId,
      actorId: context.actorId,
      action: "CREATE",
      entityType: "SALARY_EMPLOYEE",
      entityId: employee.id,
      metadata: { division: employee.division, status: employee.status },
    } });
    return employee;
  });
}

export async function updateSalaryEmployee(
  context: SalaryContext,
  employeeId: string,
  input: {
    name: string;
    division: SalaryDivision;
    whatsapp?: string | null;
    status: SalaryEmployeeStatus;
  },
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.salaryEmployee.findFirst({
      where: {
        id: employeeId,
        tenantId: context.tenantId,
        outletId: context.outletId,
      },
    });
    if (!existing) throw new SalaryError("SALARY_EMPLOYEE_NOT_FOUND", 404);
    if (existing.division !== input.division) {
      const incompatibleAssignment =
        await tx.employeeSalaryAssignment.findFirst({
          where: {
            tenantId: context.tenantId,
            outletId: context.outletId,
            employeeId: existing.id,
            status: "ACTIVE",
            salaryProfile: { division: { not: input.division } },
          },
          select: { id: true },
        });
      if (incompatibleAssignment) {
        throw new SalaryError("SALARY_EMPLOYEE_ASSIGNMENT_CONFLICT", 409);
      }
    }
    const employee = await tx.salaryEmployee.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        division: input.division,
        whatsapp: input.whatsapp || null,
        status: input.status,
      },
    });
    await tx.auditLog.create({ data: {
      tenantId: context.tenantId,
      outletId: context.outletId,
      actorId: context.actorId,
      action: "UPDATE",
      entityType: "SALARY_EMPLOYEE",
      entityId: employee.id,
      metadata: {
        previous: {
          name: existing.name,
          division: existing.division,
          whatsapp: existing.whatsapp,
          status: existing.status,
        },
        changed: {
          name: employee.name,
          division: employee.division,
          whatsapp: employee.whatsapp,
          status: employee.status,
        },
      },
    } });
    return employee;
  });
}

function previousDay(value: string) {
  const result = calendarDate(value);
  result.setUTCDate(result.getUTCDate() - 1);
  return result;
}

export async function assignSalaryProfile(
  context: SalaryContext,
  employeeId: string,
  input: {
    salaryProfileId: string;
    effectiveFrom: string;
    effectiveTo?: string | null;
  },
) {
  return prisma.$transaction(async (tx) => {
    const [employee, profile] = await Promise.all([
      tx.salaryEmployee.findFirst({
        where: {
          id: employeeId,
          tenantId: context.tenantId,
          outletId: context.outletId,
        },
      }),
      tx.salaryProfile.findFirst({
        where: {
          id: input.salaryProfileId,
          tenantId: context.tenantId,
          outletId: context.outletId,
          status: "ACTIVE",
        },
      }),
    ]);
    if (!employee) throw new SalaryError("SALARY_EMPLOYEE_NOT_FOUND", 404);
    if (!profile) throw new SalaryError("SALARY_SCOPE_MISMATCH", 404);
    if (profile.division !== employee.division) {
      throw new SalaryError("SALARY_SCOPE_MISMATCH", 409);
    }
    const start = calendarDate(input.effectiveFrom);
    const end = input.effectiveTo
      ? calendarDate(input.effectiveTo)
      : new Date("9999-12-31T00:00:00.000Z");
    const active = await tx.employeeSalaryAssignment.findFirst({
      where: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        employeeId: employee.id,
        status: "ACTIVE",
      },
      orderBy: { effectiveFrom: "desc" },
    });
    if (
      active &&
      active.salaryProfileId === profile.id &&
      active.effectiveFrom >= start
    ) {
      const priorOverlap = await tx.employeeSalaryAssignment.findFirst({
        where: {
          tenantId: context.tenantId,
          outletId: context.outletId,
          employeeId: employee.id,
          id: { not: active.id },
          effectiveFrom: { lte: active.effectiveTo ?? new Date("9999-12-31") },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
        },
      });
      if (priorOverlap) throw new SalaryError("SALARY_ASSIGNMENT_OVERLAP", 409);
      const assignment = await tx.employeeSalaryAssignment.update({
        where: { id: active.id },
        data: { effectiveFrom: start },
      });
      await tx.auditLog.create({ data: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        actorId: context.actorId,
        action: "UPDATE",
        entityType: "SALARY_ASSIGNMENT",
        entityId: assignment.id,
        metadata: {
          employeeId: employee.id,
          salaryProfileId: profile.id,
          effectiveFrom: input.effectiveFrom,
          operation: "BACKDATE_ACTIVE_ASSIGNMENT",
        },
      } });
      return assignment;
    }
    if (active && active.effectiveFrom >= start) {
      throw new SalaryError("SALARY_ASSIGNMENT_OVERLAP", 409);
    }
    if (active && (!active.effectiveTo || active.effectiveTo >= start)) {
      await tx.employeeSalaryAssignment.update({
        where: { id: active.id },
        data: { effectiveTo: previousDay(input.effectiveFrom), status: "INACTIVE" },
      });
    }
    const overlap = await tx.employeeSalaryAssignment.findFirst({
      where: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        employeeId: employee.id,
        effectiveFrom: { lte: end },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
      },
    });
    if (overlap) throw new SalaryError("SALARY_ASSIGNMENT_OVERLAP", 409);
    const assignment = await tx.employeeSalaryAssignment.create({ data: {
      tenantId: context.tenantId,
      outletId: context.outletId,
      employeeId: employee.id,
      salaryProfileId: profile.id,
      effectiveFrom: start,
      effectiveTo: input.effectiveTo ? calendarDate(input.effectiveTo) : null,
      status: "ACTIVE",
      createdByUserId: context.actorId,
    } });
    await tx.auditLog.create({ data: {
      tenantId: context.tenantId,
      outletId: context.outletId,
      actorId: context.actorId,
      action: "CREATE",
      entityType: "SALARY_ASSIGNMENT",
      entityId: assignment.id,
      metadata: {
        employeeId: employee.id,
        salaryProfileId: profile.id,
        effectiveFrom: input.effectiveFrom,
      },
    } });
    return assignment;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function listSalaryClosings(scope: SalaryScope) {
  return prisma.salaryClosing.findMany({
    where: { tenantId: scope.tenantId, outletId: scope.outletId },
    include: {
      createdBy: { select: { name: true } },
      employees: {
        select: {
          systemIncomeTotal: true,
          manualAdditionTotal: true,
          manualDeductionTotal: true,
          netSalary: true,
        },
      },
    },
    orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
  });
}

export async function getSalaryClosing(scope: SalaryScope, id: string) {
  return prisma.salaryClosing.findFirst({
    where: { id, tenantId: scope.tenantId, outletId: scope.outletId },
    include: {
      createdBy: { select: { name: true } },
      _count: { select: { employees: true } },
    },
  });
}

export async function createSalaryClosing(
  context: SalaryContext,
  input: { periodStart: string; periodEnd: string; notes?: string | null },
) {
  return prisma.$transaction(async (tx) => {
    const start = calendarDate(input.periodStart);
    const end = calendarDate(input.periodEnd);
    const overlap = await tx.salaryClosing.findFirst({
      where: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        status: { not: "VOID" },
        periodStart: { lte: end },
        periodEnd: { gte: start },
      },
    });
    if (overlap) throw new SalaryError("SALARY_CLOSING_OVERLAP", 409);
    const year = start.getUTCFullYear();
    const month = start.getUTCMonth() + 1;
    const sequence = await tx.salaryClosingSequence.upsert({
      where: {
        tenantId_outletId_year_month: {
          tenantId: context.tenantId,
          outletId: context.outletId,
          year,
          month,
        },
      },
      create: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        year,
        month,
        lastValue: 1,
      },
      update: { lastValue: { increment: 1 } },
    });
    const closingNumber = [
      "SAL", "CLS", context.outletCode, year,
      String(month).padStart(2, "0"),
      String(sequence.lastValue).padStart(4, "0"),
    ].join("/");
    const closing = await tx.salaryClosing.create({ data: {
      tenantId: context.tenantId,
      outletId: context.outletId,
      closingNumber,
      periodStart: start,
      periodEnd: end,
      status: "DRAFT",
      notes: input.notes || null,
      createdByUserId: context.actorId,
    } });
    await tx.auditLog.create({ data: {
      tenantId: context.tenantId,
      outletId: context.outletId,
      actorId: context.actorId,
      action: "CREATE",
      entityType: "SALARY_CLOSING",
      entityId: closing.id,
      metadata: {
        closingNumber,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        status: "DRAFT",
      },
    } });
    return closing;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createSalaryAdjustment(
  context: SalaryContext,
  input: {
    salaryClosingEmployeeId: string;
    type: "ADDITION" | "DEDUCTION";
    category: string;
    amount: number;
    reason: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    const employee = await tx.salaryClosingEmployee.findFirst({
      where: {
        id: input.salaryClosingEmployeeId,
        tenantId: context.tenantId,
        outletId: context.outletId,
      },
      include: { salaryClosing: { select: { status: true } } },
    });
    if (!employee) throw new SalaryError("SALARY_SCOPE_MISMATCH", 404);
    if (employee.salaryClosing.status !== "CLOSED") {
      throw new SalaryError("SALARY_CLOSING_LOCKED", 409);
    }
    const adjustment = await tx.salaryAdjustment.create({ data: {
      tenantId: context.tenantId,
      outletId: context.outletId,
      salaryClosingEmployeeId: employee.id,
      type: input.type,
      category: input.category,
      amount: new Prisma.Decimal(String(input.amount)),
      reason: input.reason,
      createdByUserId: context.actorId,
    } });
    await tx.auditLog.create({ data: {
      tenantId: context.tenantId,
      outletId: context.outletId,
      actorId: context.actorId,
      action: "CREATE",
      entityType: "SALARY_ADJUSTMENT",
      entityId: adjustment.id,
      metadata: {
        salaryClosingEmployeeId: employee.id,
        type: input.type,
        category: input.category,
        amount: String(input.amount),
        reason: input.reason,
      },
    } });
    await refreshClosingEmployeeTotals(tx, context, employee.id);
    return adjustment;
  });
}

export async function voidSalaryAdjustment(
  context: SalaryContext,
  adjustmentId: string,
  reason: string,
) {
  return prisma.$transaction(async (tx) => {
    const adjustment = await tx.salaryAdjustment.findFirst({
      where: {
        id: adjustmentId,
        tenantId: context.tenantId,
        outletId: context.outletId,
        voidedAt: null,
      },
      include: {
        closingEmployee: {
          include: { salaryClosing: { select: { status: true } } },
        },
      },
    });
    if (!adjustment) throw new SalaryError("SALARY_SCOPE_MISMATCH", 404);
    if (adjustment.closingEmployee.salaryClosing.status !== "CLOSED") {
      throw new SalaryError("SALARY_CLOSING_LOCKED", 409);
    }
    const updated = await tx.salaryAdjustment.update({
      where: { id: adjustment.id },
      data: {
        voidedAt: new Date(),
        voidedByUserId: context.actorId,
        voidReason: reason,
      },
    });
    await tx.auditLog.create({ data: {
      tenantId: context.tenantId,
      outletId: context.outletId,
      actorId: context.actorId,
      action: "UPDATE",
      entityType: "VOID_SALARY_ADJUSTMENT",
      entityId: adjustment.id,
      metadata: { reason },
    } });
    await refreshClosingEmployeeTotals(
      tx,
      context,
      adjustment.salaryClosingEmployeeId,
    );
    return updated;
  });
}
