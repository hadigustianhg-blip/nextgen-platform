import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  calculateEmployeeSalary,
  createSalaryEmployeeMatcher,
  type SalaryCalculationSetting,
  type SalaryDispatchSource,
  type SalaryPickupSource,
} from "./salary.calculation";
import { SalaryError } from "./salary.api";
import type { SalaryContext, SalaryScope } from "./salary.service";

const zero = () => new Prisma.Decimal(0);
const dateKey = (value: Date) => value.toISOString().slice(0, 10);
const dateOnly = (value: string) => new Date(`${value}T00:00:00.000Z`);
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

type Transaction = Prisma.TransactionClient;

const settingForCalculation = (assignment: {
  salaryProfile: {
    id: string;
    code: string;
    version: number;
    setting: {
      basicDailySalary: Prisma.Decimal | null;
      fixedAllowance: Prisma.Decimal | null;
      deliveryPerKgAmount: Prisma.Decimal | null;
      deliveryPerKgMinWeight: Prisma.Decimal | null;
      deliveryPerKgMaxWeight: Prisma.Decimal | null;
      deliveryPerWaybillAmount: Prisma.Decimal | null;
      deliveryPerWaybillMinWeight: Prisma.Decimal | null;
      deliveryPerWaybillMaxWeight: Prisma.Decimal | null;
      pickupRegularRevenuePercentage: Prisma.Decimal | null;
      pickupRegularPerWaybillAmount: Prisma.Decimal | null;
      pickupMarketplacePerWaybillAmount: Prisma.Decimal | null;
      dailyFuelMinDeliveryWaybill: number | null;
      dailyFuelAmount: Prisma.Decimal | null;
      dailyExtraMinDeliveryWaybill: number | null;
      dailyExtraAmount: Prisma.Decimal | null;
    } | null;
  };
}): SalaryCalculationSetting | null => {
  const setting = assignment.salaryProfile.setting;
  if (!setting) return null;
  return {
    profileId: assignment.salaryProfile.id,
    profileCode: assignment.salaryProfile.code,
    profileVersion: assignment.salaryProfile.version,
    ...setting,
  };
};

function assignmentOnDate<T extends {
  effectiveFrom: Date;
  effectiveTo: Date | null;
}>(assignments: T[], date: Date) {
  return assignments.find((assignment) =>
    assignment.effectiveFrom <= date &&
    (!assignment.effectiveTo || assignment.effectiveTo >= date)
  );
}

async function refreshClosingEmployeeTotals(
  tx: Transaction,
  scope: SalaryScope,
  closingEmployeeId: string,
) {
  const [components, adjustments, allocations] = await Promise.all([
    tx.salaryClosingComponent.aggregate({
      where: {
        tenantId: scope.tenantId,
        outletId: scope.outletId,
        salaryClosingEmployeeId: closingEmployeeId,
        componentType: "INCOME",
      },
      _sum: { amount: true },
    }),
    tx.salaryAdjustment.groupBy({
      by: ["type"],
      where: {
        tenantId: scope.tenantId,
        outletId: scope.outletId,
        salaryClosingEmployeeId: closingEmployeeId,
        voidedAt: null,
      },
      _sum: { amount: true },
    }),
    tx.salaryKasbonAllocation.aggregate({
      where: {
        tenantId: scope.tenantId,
        outletId: scope.outletId,
        salaryClosingEmployeeId: closingEmployeeId,
        status: { in: ["DRAFT", "FINALIZED"] },
      },
      _sum: { amount: true },
    }),
  ]);
  const systemIncome = components._sum.amount ?? zero();
  const addition = adjustments.find((row) => row.type === "ADDITION")
    ?._sum.amount ?? zero();
  const manualDeduction = adjustments.find((row) => row.type === "DEDUCTION")
    ?._sum.amount ?? zero();
  const kasbon = allocations._sum.amount ?? zero();
  const deduction = manualDeduction.plus(kasbon);
  return tx.salaryClosingEmployee.update({
    where: { id: closingEmployeeId },
    data: {
      systemIncomeTotal: systemIncome,
      manualAdditionTotal: addition,
      manualDeductionTotal: deduction,
      netSalary: systemIncome.plus(addition).minus(deduction),
    },
  });
}

export async function generateSalaryClosing(
  context: SalaryContext,
  closingId: string,
) {
  return prisma.$transaction(async (tx) => {
    const closing = await tx.salaryClosing.findFirst({
      where: {
        id: closingId,
        tenantId: context.tenantId,
        outletId: context.outletId,
      },
    });
    if (!closing) throw new SalaryError("SALARY_CLOSING_NOT_FOUND", 404);
    if (!["DRAFT", "CLOSED"].includes(closing.status)) {
      throw new SalaryError("SALARY_CLOSING_LOCKED", 409);
    }

    const [employees, pickups, dispatches, kasbons] = await Promise.all([
      tx.salaryEmployee.findMany({
        where: {
          tenantId: context.tenantId,
          outletId: context.outletId,
        },
        include: {
          aliases: { where: { isActive: true } },
          assignments: {
            where: {
              effectiveFrom: { lte: closing.periodEnd },
              OR: [
                { effectiveTo: null },
                { effectiveTo: { gte: closing.periodStart } },
              ],
              salaryProfile: { status: "ACTIVE" },
            },
            include: { salaryProfile: { include: { setting: true } } },
            orderBy: { effectiveFrom: "asc" },
          },
        },
      }),
      tx.rawPickup.findMany({
        where: {
          tenantId: context.tenantId,
          outletId: context.outletId,
          operationalDate: {
            gte: closing.periodStart,
            lte: closing.periodEnd,
          },
          syncStatus: { not: "ERROR" },
        },
        select: {
          id: true,
          sourceRecordKey: true,
          operationalDate: true,
          waybillNo: true,
          staffNameRaw: true,
          settlementRaw: true,
          freight: true,
        },
        orderBy: [{ operationalDate: "asc" }, { id: "asc" }],
      }),
      tx.rawDispatch.findMany({
        where: {
          tenantId: context.tenantId,
          outletId: context.outletId,
          operationalDate: {
            gte: closing.periodStart,
            lte: closing.periodEnd,
          },
          syncStatus: { not: "ERROR" },
        },
        select: {
          id: true,
          sourceRecordKey: true,
          operationalDate: true,
          waybillNo: true,
          courierNameRaw: true,
          deliveryStatusRaw: true,
          chargeWeight: true,
        },
        orderBy: [{ operationalDate: "asc" }, { id: "asc" }],
      }),
      tx.operationalExpense.findMany({
        where: {
          tenantId: context.tenantId,
          outletId: context.outletId,
          operationalDate: {
            gte: closing.periodStart,
            lte: closing.periodEnd,
          },
          status: "VALID",
          category: { equals: "Kasbon", mode: "insensitive" },
          teamName: { not: null },
        },
        select: {
          id: true,
          operationalDate: true,
          teamName: true,
        },
      }),
    ]);

    const pickupIds = pickups.map((row) => row.id);
    const dispatchIds = dispatches.map((row) => row.id);
    const conflicts = pickupIds.length || dispatchIds.length
      ? await tx.salaryClosingSourceRecord.findMany({
        where: {
          tenantId: context.tenantId,
          outletId: context.outletId,
          isActive: true,
          salaryClosingId: { not: closing.id },
          OR: [
            ...(pickupIds.length ? [{
              sourceType: "PICKUP" as const,
              sourceRecordId: { in: pickupIds },
            }] : []),
            ...(dispatchIds.length ? [{
              sourceType: "DISPATCH" as const,
              sourceRecordId: { in: dispatchIds },
            }] : []),
          ],
        },
        select: { sourceType: true, sourceRecordId: true },
      })
      : [];
    if (conflicts.length) {
      throw new SalaryError("SALARY_SOURCE_ALREADY_USED", 409);
    }

    await tx.salaryClosingSourceRecord.deleteMany({
      where: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        salaryClosingId: closing.id,
      },
    });
    await tx.salaryClosingComponent.deleteMany({
      where: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        closingEmployee: { salaryClosingId: closing.id },
      },
    });
    await tx.salaryClosingProfileSnapshot.deleteMany({
      where: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        salaryClosingId: closing.id,
      },
    });

    const matchEmployee = createSalaryEmployeeMatcher(employees);
    const employeeById = new Map(employees.map((employee) => [
      employee.id,
      employee,
    ]));
    const pickupByEmployee = new Map<string, SalaryPickupSource[]>();
    const dispatchByEmployee = new Map<string, SalaryDispatchSource[]>();
    const sourceRows: Prisma.SalaryClosingSourceRecordCreateManyInput[] = [];
    const warningEmployeeIds = new Set<string>();
    const kasbonEmployeeIds = new Set<string>();
    let unmatchedPickup = 0;
    let unmatchedDispatch = 0;

    const addUnmatched = (
      sourceType: "PICKUP" | "DISPATCH",
      source: {
        id: string;
        sourceRecordKey: string;
        operationalDate: Date;
        waybillNo: string;
      },
      employeeNameRaw: string | null,
      reason: string,
      employeeId?: string,
    ) => {
      if (sourceType === "PICKUP") unmatchedPickup += 1;
      else unmatchedDispatch += 1;
      if (employeeId) warningEmployeeIds.add(employeeId);
      sourceRows.push({
        tenantId: context.tenantId,
        outletId: context.outletId,
        salaryClosingId: closing.id,
        sourceType,
        sourceRecordId: source.id,
        sourceKey: source.sourceRecordKey,
        sourceDate: source.operationalDate,
        waybillNumber: source.waybillNo,
        employeeNameRaw,
        matchedSalaryEmployeeId: employeeId,
        calculationStatus: "UNMATCHED",
        exclusionReason: reason,
        isActive: true,
      });
    };

    for (const source of pickups) {
      const match = matchEmployee(source.staffNameRaw, "PICKUP");
      if (!match.employeeId) {
        addUnmatched(
          "PICKUP",
          source,
          source.staffNameRaw,
          match.reason ?? "EMPLOYEE_NOT_MAPPED",
        );
        continue;
      }
      const employee = employeeById.get(match.employeeId)!;
      const assignment = assignmentOnDate(
        employee.assignments,
        source.operationalDate,
      );
      const setting = assignment ? settingForCalculation(assignment) : null;
      if (!assignment || !setting || assignment.salaryProfile.division !== employee.division) {
        addUnmatched(
          "PICKUP",
          source,
          source.staffNameRaw,
          "PROFILE_NOT_ASSIGNED",
          employee.id,
        );
        continue;
      }
      pickupByEmployee.set(employee.id, [
        ...(pickupByEmployee.get(employee.id) ?? []),
        {
          id: source.id,
          sourceKey: source.sourceRecordKey,
          employeeNameRaw: source.staffNameRaw,
          date: dateKey(source.operationalDate),
          waybill: source.waybillNo,
          settlement: source.settlementRaw,
          freight: source.freight,
          setting,
        },
      ]);
    }
    for (const source of dispatches) {
      const match = matchEmployee(source.courierNameRaw, "DISPATCH");
      if (!match.employeeId) {
        addUnmatched(
          "DISPATCH",
          source,
          source.courierNameRaw,
          match.reason ?? "EMPLOYEE_NOT_MAPPED",
        );
        continue;
      }
      const employee = employeeById.get(match.employeeId)!;
      const assignment = assignmentOnDate(
        employee.assignments,
        source.operationalDate,
      );
      const setting = assignment ? settingForCalculation(assignment) : null;
      if (!assignment || !setting || assignment.salaryProfile.division !== employee.division) {
        addUnmatched(
          "DISPATCH",
          source,
          source.courierNameRaw,
          "PROFILE_NOT_ASSIGNED",
          employee.id,
        );
        continue;
      }
      dispatchByEmployee.set(employee.id, [
        ...(dispatchByEmployee.get(employee.id) ?? []),
        {
          id: source.id,
          sourceKey: source.sourceRecordKey,
          employeeNameRaw: source.courierNameRaw,
          date: dateKey(source.operationalDate),
          waybill: source.waybillNo,
          status: source.deliveryStatusRaw,
          weight: source.chargeWeight,
          setting,
        },
      ]);
    }
    for (const kasbon of kasbons) {
      const match = matchEmployee(kasbon.teamName, "PICKUP");
      if (match.employeeId) kasbonEmployeeIds.add(match.employeeId);
    }
    const configuredEmployeeIds = employees
      .filter((employee) => employee.status === "ACTIVE" &&
        employee.assignments.some((assignment) =>
          assignment.salaryProfile.setting?.basicDailySalary?.greaterThan(0) ||
          assignment.salaryProfile.setting?.fixedAllowance?.greaterThan(0)
        ))
      .map((employee) => employee.id);

    const activeEmployeeIds = new Set([
      ...pickupByEmployee.keys(),
      ...dispatchByEmployee.keys(),
      ...warningEmployeeIds,
      ...kasbonEmployeeIds,
      ...configuredEmployeeIds,
    ]);
    const profileSnapshots = new Map<string, {
      profile: typeof employees[number]["assignments"][number]["salaryProfile"];
      assignment: typeof employees[number]["assignments"][number];
    }>();
    let generatedEmployees = 0;
    for (const employeeId of activeEmployeeIds) {
      const employee = employeeById.get(employeeId)!;
      const employeePickups = pickupByEmployee.get(employeeId) ?? [];
      const employeeDispatches = dispatchByEmployee.get(employeeId) ?? [];
      const usedProfileIds = new Set([
        ...employeePickups.map((row) => row.setting.profileId),
        ...employeeDispatches.map((row) => row.setting.profileId),
      ]);
      const primaryAssignment = employee.assignments.find((assignment) =>
        usedProfileIds.has(assignment.salaryProfileId)
      ) ?? employee.assignments[0];
      if (!primaryAssignment) continue;
      if (!usedProfileIds.size) {
        usedProfileIds.add(primaryAssignment.salaryProfileId);
      }
      for (const assignment of employee.assignments) {
        if (usedProfileIds.has(assignment.salaryProfileId)) {
          profileSnapshots.set(assignment.salaryProfileId, {
            profile: assignment.salaryProfile,
            assignment,
          });
        }
      }
      const calculated = calculateEmployeeSalary({
        pickups: employeePickups,
        dispatches: employeeDispatches,
      });
      const closingEmployee = await tx.salaryClosingEmployee.upsert({
        where: {
          salaryClosingId_employeeId: {
            salaryClosingId: closing.id,
            employeeId: employee.id,
          },
        },
        create: {
          tenantId: context.tenantId,
          outletId: context.outletId,
          salaryClosingId: closing.id,
          employeeId: employee.id,
          employeeNameSnapshot: employee.name,
          divisionSnapshot: employee.division,
          whatsappSnapshot: employee.whatsapp,
          salaryProfileId: primaryAssignment.salaryProfileId,
          salaryProfileCodeSnapshot: primaryAssignment.salaryProfile.code,
          salaryProfileVersionSnapshot: primaryAssignment.salaryProfile.version,
          systemIncomeTotal: calculated.systemIncomeTotal,
          manualAdditionTotal: zero(),
          manualDeductionTotal: zero(),
          netSalary: calculated.systemIncomeTotal,
          status: "REVIEWED",
          workDayCount: calculated.workDates.length,
          sourcePickupCount: calculated.pickupCount,
          sourceDispatchCount: calculated.dispatchCount,
          calculationWarningCount: warningEmployeeIds.has(employee.id) ? 1 : 0,
          generatedAt: new Date(),
        },
        update: {
          employeeNameSnapshot: employee.name,
          divisionSnapshot: employee.division,
          whatsappSnapshot: employee.whatsapp,
          salaryProfileId: primaryAssignment.salaryProfileId,
          salaryProfileCodeSnapshot: primaryAssignment.salaryProfile.code,
          salaryProfileVersionSnapshot: primaryAssignment.salaryProfile.version,
          systemIncomeTotal: calculated.systemIncomeTotal,
          status: "REVIEWED",
          workDayCount: calculated.workDates.length,
          sourcePickupCount: calculated.pickupCount,
          sourceDispatchCount: calculated.dispatchCount,
          calculationWarningCount: warningEmployeeIds.has(employee.id) ? 1 : 0,
          generatedAt: new Date(),
        },
      });
      generatedEmployees += 1;
      if (calculated.components.length) {
        await tx.salaryClosingComponent.createMany({
          data: calculated.components.map((component) => ({
            tenantId: context.tenantId,
            outletId: context.outletId,
            salaryClosingEmployeeId: closingEmployee.id,
            componentCode: component.code,
            componentName: component.name,
            componentType: "INCOME",
            sourceType: component.sourceType,
            quantity: component.quantity,
            rate: component.rate,
            amount: component.amount,
            metadata: json(component.metadata),
          })),
        });
      }
      const pickupMap = new Map(employeePickups.map((row) => [row.id, row]));
      const dispatchMap = new Map(employeeDispatches.map((row) => [row.id, row]));
      for (const detail of calculated.sources) {
        const pickup = pickupMap.get(detail.sourceRecordId);
        const dispatch = dispatchMap.get(detail.sourceRecordId);
        const source = pickup ?? dispatch!;
        sourceRows.push({
          tenantId: context.tenantId,
          outletId: context.outletId,
          salaryClosingId: closing.id,
          salaryClosingEmployeeId: closingEmployee.id,
          sourceType: detail.sourceType,
          sourceRecordId: detail.sourceRecordId,
          sourceKey: source.sourceKey ?? detail.sourceRecordId,
          sourceDate: dateOnly(source.date),
          waybillNumber: source.waybill,
          employeeNameRaw: source.employeeNameRaw ?? employee.name,
          matchedSalaryEmployeeId: employee.id,
          calculationStatus: detail.calculationStatus,
          exclusionReason: detail.exclusionReason,
          calculationType: detail.calculationType,
          weight: dispatch?.weight,
          settlement: pickup?.settlement,
          freight: pickup?.freight,
          rate: detail.rate,
          amount: detail.amount,
          metadata: json({ profileId: source.setting.profileId }),
          isActive: true,
        });
      }
      await refreshClosingEmployeeTotals(tx, context, closingEmployee.id);
      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          outletId: context.outletId,
          actorId: context.actorId,
          action: "CREATE",
          entityType: "SALARY_EMPLOYEE_CALCULATION",
          entityId: closingEmployee.id,
          metadata: {
            closingId: closing.id,
            employeeId: employee.id,
            workDayCount: calculated.workDates.length,
            pickupCount: calculated.pickupCount,
            dispatchCount: calculated.dispatchCount,
            systemIncomeTotal: calculated.systemIncomeTotal.toString(),
          },
        },
      });
    }

    const staleEmployees = await tx.salaryClosingEmployee.findMany({
      where: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        salaryClosingId: closing.id,
        employeeId: { notIn: [...activeEmployeeIds] },
      },
      include: {
        _count: { select: { adjustments: true, kasbonAllocations: true } },
      },
    });
    for (const stale of staleEmployees) {
      if (!stale._count.adjustments && !stale._count.kasbonAllocations) {
        await tx.salaryClosingEmployee.delete({ where: { id: stale.id } });
      } else {
        await tx.salaryClosingEmployee.update({
          where: { id: stale.id },
          data: {
            systemIncomeTotal: zero(),
            workDayCount: 0,
            sourcePickupCount: 0,
            sourceDispatchCount: 0,
            calculationWarningCount: 0,
            generatedAt: new Date(),
          },
        });
        await refreshClosingEmployeeTotals(tx, context, stale.id);
      }
    }

    for (const snapshot of profileSnapshots.values()) {
      const setting = snapshot.profile.setting!;
      await tx.salaryClosingProfileSnapshot.create({
        data: {
          tenantId: context.tenantId,
          outletId: context.outletId,
          salaryClosingId: closing.id,
          salaryProfileId: snapshot.profile.id,
          profileCode: snapshot.profile.code,
          profileName: snapshot.profile.name,
          profileVersion: snapshot.profile.version,
          division: snapshot.profile.division,
          basicDailySalary: setting.basicDailySalary,
          overtimeRate: setting.overtimeRate,
          fixedAllowance: setting.fixedAllowance,
          deliveryPerKgAmount: setting.deliveryPerKgAmount,
          deliveryPerKgMinWeight: setting.deliveryPerKgMinWeight,
          deliveryPerKgMaxWeight: setting.deliveryPerKgMaxWeight,
          deliveryPerWaybillAmount: setting.deliveryPerWaybillAmount,
          deliveryPerWaybillMinWeight: setting.deliveryPerWaybillMinWeight,
          deliveryPerWaybillMaxWeight: setting.deliveryPerWaybillMaxWeight,
          pickupRegularRevenuePercentage:
            setting.pickupRegularRevenuePercentage,
          pickupRegularPerWaybillAmount:
            setting.pickupRegularPerWaybillAmount,
          pickupMarketplacePerWaybillAmount:
            setting.pickupMarketplacePerWaybillAmount,
          dailyFuelMinDeliveryWaybill:
            setting.dailyFuelMinDeliveryWaybill,
          dailyFuelAmount: setting.dailyFuelAmount,
          dailyExtraMinDeliveryWaybill:
            setting.dailyExtraMinDeliveryWaybill,
          dailyExtraAmount: setting.dailyExtraAmount,
          dispatchRequiredStatus: setting.dispatchRequiredStatus,
          effectiveFrom: snapshot.assignment.effectiveFrom,
          effectiveTo: snapshot.assignment.effectiveTo,
          pickupRegularSettlements: ["DFOD", "Tunai"],
          pickupMarketplaceSettlements: ["Bulanan"],
          generatedAt: new Date(),
        },
      });
    }
    if (sourceRows.length) {
      await tx.salaryClosingSourceRecord.createMany({ data: sourceRows });
      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          outletId: context.outletId,
          actorId: context.actorId,
          action: "CREATE",
          entityType: "SALARY_SOURCE_RECORDS_LINKED",
          entityId: closing.id,
          metadata: {
            sourceRecordCount: sourceRows.length,
            warningCount: unmatchedPickup + unmatchedDispatch,
          },
        },
      });
    }
    const warningCount = unmatchedPickup + unmatchedDispatch;
    const updated = await tx.salaryClosing.update({
      where: { id: closing.id },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        closedByUserId: context.actorId,
        generatedAt: new Date(),
        calculationWarningCount: warningCount,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        actorId: context.actorId,
        action: "UPDATE",
        entityType: closing.status === "DRAFT"
          ? "SALARY_CLOSING_GENERATED"
          : "SALARY_CLOSING_RECALCULATED",
        entityId: closing.id,
        metadata: {
          periodStart: dateKey(closing.periodStart),
          periodEnd: dateKey(closing.periodEnd),
          generatedEmployees,
          sourceRecordCount: sourceRows.length,
          unmatchedPickup,
          unmatchedDispatch,
        },
      },
    });
    return {
      ...updated,
      generatedEmployees,
      warnings: { unmatchedPickup, unmatchedDispatch },
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 120_000,
  });
}

export async function getSalaryClosingReview(
  scope: SalaryScope,
  closingId: string,
) {
  return prisma.salaryClosing.findFirst({
    where: {
      id: closingId,
      tenantId: scope.tenantId,
      outletId: scope.outletId,
    },
    include: {
      createdBy: { select: { name: true } },
      processedBy: { select: { name: true } },
      employees: {
        orderBy: { employeeNameSnapshot: "asc" },
        include: {
          components: { orderBy: { componentName: "asc" } },
          adjustments: { orderBy: { createdAt: "desc" } },
          kasbonAllocations: {
            where: { status: { not: "VOID" } },
            include: { operationalExpense: true },
          },
        },
      },
      sourceRecords: {
        where: { calculationStatus: "UNMATCHED", isActive: true },
        orderBy: [{ sourceDate: "asc" }, { sourceType: "asc" }],
      },
    },
  });
}

export async function listSalaryClosingEmployeeSources(
  scope: SalaryScope,
  closingId: string,
  closingEmployeeId: string,
) {
  return prisma.salaryClosingSourceRecord.findMany({
    where: {
      tenantId: scope.tenantId,
      outletId: scope.outletId,
      salaryClosingId: closingId,
      salaryClosingEmployeeId: closingEmployeeId,
      isActive: true,
    },
    orderBy: [{ sourceDate: "asc" }, { waybillNumber: "asc" }],
  });
}

export async function listSalaryClosingEmployees(
  scope: SalaryScope,
  closingId: string,
) {
  return prisma.salaryClosingEmployee.findMany({
    where: {
      tenantId: scope.tenantId,
      outletId: scope.outletId,
      salaryClosingId: closingId,
    },
    include: {
      components: true,
      adjustments: { orderBy: { createdAt: "desc" } },
      kasbonAllocations: {
        where: { status: { not: "VOID" } },
        include: { operationalExpense: true },
      },
    },
    orderBy: { employeeNameSnapshot: "asc" },
  });
}

export async function getSalaryClosingEmployeeReview(
  scope: SalaryScope,
  closingId: string,
  closingEmployeeId: string,
) {
  return prisma.salaryClosingEmployee.findFirst({
    where: {
      id: closingEmployeeId,
      salaryClosingId: closingId,
      tenantId: scope.tenantId,
      outletId: scope.outletId,
    },
    include: {
      components: true,
      adjustments: { orderBy: { createdAt: "desc" } },
      kasbonAllocations: {
        where: { status: { not: "VOID" } },
        include: { operationalExpense: true },
      },
    },
  });
}

export async function processSalaryClosing(
  context: SalaryContext,
  closingId: string,
) {
  return prisma.$transaction(async (tx) => {
    const closing = await tx.salaryClosing.findFirst({
      where: {
        id: closingId,
        tenantId: context.tenantId,
        outletId: context.outletId,
      },
      include: {
        employees: true,
        sourceRecords: {
          where: { isActive: true, calculationStatus: "UNMATCHED" },
          select: { id: true },
        },
      },
    });
    if (!closing) throw new SalaryError("SALARY_CLOSING_NOT_FOUND", 404);
    if (closing.status !== "CLOSED") {
      throw new SalaryError("SALARY_CLOSING_LOCKED", 409);
    }
    if (!closing.employees.length) {
      throw new SalaryError("SALARY_CLOSING_EMPTY", 409);
    }
    if (closing.sourceRecords.length) {
      throw new SalaryError("SALARY_CLOSING_HAS_WARNINGS", 409);
    }
    if (closing.employees.some((employee) => employee.netSalary.lessThan(0))) {
      throw new SalaryError("SALARY_NEGATIVE_NET", 409);
    }
    const allocations = await tx.salaryKasbonAllocation.findMany({
      where: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        status: "DRAFT",
        closingEmployee: { salaryClosingId: closing.id },
      },
    });
    if (allocations.length) {
      await tx.salaryKasbonAllocation.updateMany({
        where: { id: { in: allocations.map((row) => row.id) } },
        data: { status: "FINALIZED", finalizedAt: new Date() },
      });
    }
    await tx.salaryClosingEmployee.updateMany({
      where: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        salaryClosingId: closing.id,
      },
      data: { status: "PROCESSED" },
    });
    const processed = await tx.salaryClosing.update({
      where: { id: closing.id },
      data: {
        status: "PROCESSED",
        processedAt: new Date(),
        processedByUserId: context.actorId,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        actorId: context.actorId,
        action: "UPDATE",
        entityType: "SALARY_CLOSING_PROCESSED",
        entityId: closing.id,
        metadata: {
          employeeCount: closing.employees.length,
          kasbonAllocationCount: allocations.length,
        },
      },
    });
    return processed;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function voidSalaryClosing(
  context: SalaryContext,
  closingId: string,
  reason: string,
) {
  return prisma.$transaction(async (tx) => {
    const closing = await tx.salaryClosing.findFirst({
      where: {
        id: closingId,
        tenantId: context.tenantId,
        outletId: context.outletId,
      },
    });
    if (!closing) throw new SalaryError("SALARY_CLOSING_NOT_FOUND", 404);
    if (!["DRAFT", "CLOSED"].includes(closing.status)) {
      throw new SalaryError("SALARY_CLOSING_LOCKED", 409);
    }
    await tx.salaryClosingSourceRecord.updateMany({
      where: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        salaryClosingId: closing.id,
        isActive: true,
      },
      data: { isActive: false },
    });
    await tx.salaryKasbonAllocation.updateMany({
      where: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        status: "DRAFT",
        closingEmployee: { salaryClosingId: closing.id },
      },
      data: {
        status: "VOID",
        voidedAt: new Date(),
        voidedByUserId: context.actorId,
        voidReason: reason,
      },
    });
    const updated = await tx.salaryClosing.update({
      where: { id: closing.id },
      data: {
        status: "VOID",
        voidedAt: new Date(),
        voidedByUserId: context.actorId,
        voidReason: reason,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        actorId: context.actorId,
        action: "UPDATE",
        entityType: "SALARY_CLOSING_VOIDED",
        entityId: closing.id,
        metadata: { reason },
      },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function listSalaryRecaps(scope: SalaryScope) {
  return prisma.salaryClosing.findMany({
    where: {
      tenantId: scope.tenantId,
      outletId: scope.outletId,
      status: { in: ["PROCESSED", "PAID"] },
    },
    include: {
      employees: true,
      processedBy: { select: { name: true } },
    },
    orderBy: { processedAt: "desc" },
  });
}

export async function getSalaryRecapDetail(
  scope: SalaryScope,
  closingId: string,
) {
  return prisma.salaryClosing.findFirst({
    where: {
      id: closingId,
      tenantId: scope.tenantId,
      outletId: scope.outletId,
      status: { in: ["PROCESSED", "PAID"] },
    },
    include: {
      createdBy: { select: { name: true } },
      processedBy: { select: { name: true } },
      employees: {
        orderBy: { employeeNameSnapshot: "asc" },
        include: {
          components: { orderBy: { componentName: "asc" } },
          adjustments: { orderBy: { createdAt: "desc" } },
          kasbonAllocations: {
            where: { status: "FINALIZED" },
            include: { operationalExpense: true },
          },
        },
      },
      sourceRecords: {
        where: { isActive: true, calculationStatus: "UNMATCHED" },
      },
    },
  });
}

export { refreshClosingEmployeeTotals };
