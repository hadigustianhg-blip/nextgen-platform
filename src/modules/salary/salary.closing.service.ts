import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  calculateEmployeeSalary,
  createSalaryEmployeeMatcher,
  resolveSalaryAssignmentOnDate,
  type SalaryCalculationSetting,
  type SalaryDispatchSource,
  type SalaryPickupSource,
} from "./salary.calculation";
import { SalaryError } from "./salary.api";
import type { SalaryContext, SalaryScope } from "./salary.service";
import {
  captureSalaryClosingSnapshots,
  loadSalaryOperationalSnapshots,
} from "./salary.snapshot.service";

const zero = () => new Prisma.Decimal(0);
const dateKey = (value: Date) => value.toISOString().slice(0, 10);
const dateOnly = (value: string) => new Date(`${value}T00:00:00.000Z`);
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const exposeKasbonSnapshot = <T extends {
  operationalExpenseId: string;
  kasbonSnapshot: null | {
    sourceOperationalExpenseId: string;
    operationalDate: Date;
    category: string;
    amount: Prisma.Decimal;
    description: string | null;
    teamName: string | null;
    sourceStatus: string;
  };
}>(allocation: T) => ({
  ...allocation,
  operationalExpense: allocation.kasbonSnapshot
    ? {
      id: allocation.kasbonSnapshot.sourceOperationalExpenseId,
      operationalDate: allocation.kasbonSnapshot.operationalDate,
      category: allocation.kasbonSnapshot.category,
      amount: allocation.kasbonSnapshot.amount,
      description: allocation.kasbonSnapshot.description,
      teamName: allocation.kasbonSnapshot.teamName,
      status: allocation.kasbonSnapshot.sourceStatus,
    }
    : null,
});

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
  return prisma.$transaction(
    (tx) => generateSalaryClosingInTransaction(tx, context, closingId),
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 120_000,
    },
  );
}

export async function generateSalaryClosingInTransaction(
  tx: Transaction,
  context: SalaryContext,
  closingId: string,
) {
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

    const employees = await captureSalaryClosingSnapshots(
      tx,
      context,
      closing,
    );
    const { pickups, dispatches, kasbons } =
      await loadSalaryOperationalSnapshots(tx, context, closing.id);

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
          sourceMasterPickupId?: string;
          sourceMasterDispatchId?: string;
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
        sourceKey: source.sourceMasterPickupId ??
          source.sourceMasterDispatchId ?? source.id,
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
      const match = matchEmployee(source.staffName, "PICKUP");
      if (!match.employeeId) {
        addUnmatched(
          "PICKUP",
          source,
          source.staffName,
          match.reason ?? "EMPLOYEE_NOT_MATCHED",
        );
        continue;
      }
      const employee = employeeById.get(match.employeeId)!;
      const resolved = resolveSalaryAssignmentOnDate(
        employee.assignments,
        source.operationalDate,
        employee.division,
      );
      const assignment = resolved.assignment;
      const setting = assignment ? settingForCalculation(assignment) : null;
      if (!assignment || !setting) {
        addUnmatched(
          "PICKUP",
          source,
          source.staffName,
          resolved.reason ?? "PROFILE_SETTING_NOT_FOUND",
          employee.id,
        );
        continue;
      }
      pickupByEmployee.set(employee.id, [
        ...(pickupByEmployee.get(employee.id) ?? []),
        {
          id: source.id,
          sourceKey: source.sourceMasterPickupId,
          employeeNameRaw: source.staffName,
          date: dateKey(source.operationalDate),
          waybill: source.waybillNo,
          settlement: source.settlement,
          freight: source.freightAmount,
          setting,
        },
      ]);
    }
    for (const source of dispatches) {
      const match = matchEmployee(source.courierName, "DISPATCH");
      if (!match.employeeId) {
        addUnmatched(
          "DISPATCH",
          source,
          source.courierName,
          match.reason ?? "EMPLOYEE_NOT_MATCHED",
        );
        continue;
      }
      const employee = employeeById.get(match.employeeId)!;
      const resolved = resolveSalaryAssignmentOnDate(
        employee.assignments,
        source.operationalDate,
        employee.division,
      );
      const assignment = resolved.assignment;
      const setting = assignment ? settingForCalculation(assignment) : null;
      if (!assignment || !setting) {
        addUnmatched(
          "DISPATCH",
          source,
          source.courierName,
          resolved.reason ?? "PROFILE_SETTING_NOT_FOUND",
          employee.id,
        );
        continue;
      }
      dispatchByEmployee.set(employee.id, [
        ...(dispatchByEmployee.get(employee.id) ?? []),
        {
          id: source.id,
          sourceKey: source.sourceMasterDispatchId,
          employeeNameRaw: source.courierName,
          date: dateKey(source.operationalDate),
          waybill: source.waybillNo,
          status: source.deliveryStatus,
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
          status: "PENDING_REVIEW",
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
          status: "PENDING_REVIEW",
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
      const totals = await refreshClosingEmployeeTotals(
        tx,
        context,
        closingEmployee.id,
      );
      await tx.salaryCalculationSnapshot.upsert({
        where: { salaryClosingEmployeeId: closingEmployee.id },
        create: {
          tenantId: context.tenantId,
          outletId: context.outletId,
          salaryClosingEmployeeId: closingEmployee.id,
          systemIncomeTotal: totals.systemIncomeTotal,
          manualAdditionTotal: totals.manualAdditionTotal,
          manualDeductionTotal: totals.manualDeductionTotal,
          netSalary: totals.netSalary,
          workDayCount: calculated.workDates.length,
          sourcePickupCount: calculated.pickupCount,
          sourceDispatchCount: calculated.dispatchCount,
          calculationWarningCount: warningEmployeeIds.has(employee.id) ? 1 : 0,
          components: json(calculated.components),
        },
        update: {
          systemIncomeTotal: totals.systemIncomeTotal,
          manualAdditionTotal: totals.manualAdditionTotal,
          manualDeductionTotal: totals.manualDeductionTotal,
          netSalary: totals.netSalary,
          workDayCount: calculated.workDates.length,
          sourcePickupCount: calculated.pickupCount,
          sourceDispatchCount: calculated.dispatchCount,
          calculationWarningCount: warningEmployeeIds.has(employee.id) ? 1 : 0,
          components: json(calculated.components),
          calculatedAt: new Date(),
        },
      });
      await tx.salaryAudit.create({
        data: {
          tenantId: context.tenantId,
          outletId: context.outletId,
          salaryClosingId: closing.id,
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
            status: "PENDING_REVIEW",
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
      await tx.salaryAudit.create({
        data: {
          tenantId: context.tenantId,
          outletId: context.outletId,
          salaryClosingId: closing.id,
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
    await tx.salaryAudit.create({
      data: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        salaryClosingId: closing.id,
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
}

export async function getSalaryClosingReview(
  scope: SalaryScope,
  closingId: string,
) {
  const [closing, availableProfiles] = await Promise.all([
    prisma.salaryClosing.findFirst({
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
              include: { kasbonSnapshot: true },
            },
          },
        },
        sourceRecords: {
          where: { calculationStatus: "UNMATCHED", isActive: true },
          orderBy: [{ sourceDate: "asc" }, { sourceType: "asc" }],
          include: {
            matchedEmployee: {
              select: {
                id: true,
                name: true,
                division: true,
                assignments: {
                  orderBy: { effectiveFrom: "desc" },
                  include: {
                    salaryProfile: {
                      select: {
                        id: true,
                        name: true,
                        version: true,
                        status: true,
                        effectiveFrom: true,
                        effectiveTo: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.salaryProfile.findMany({
      where: {
        tenantId: scope.tenantId,
        outletId: scope.outletId,
        status: "ACTIVE",
      },
      select: {
        id: true,
        name: true,
        version: true,
        division: true,
        effectiveFrom: true,
        effectiveTo: true,
      },
      orderBy: [{ name: "asc" }, { version: "desc" }],
    }),
  ]);
  return closing ? {
    ...closing,
    employees: closing.employees.map((employee) => ({
      ...employee,
      kasbonAllocations: employee.kasbonAllocations.map(
        exposeKasbonSnapshot,
      ),
    })),
    availableProfiles,
  } : null;
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
  const employees = await prisma.salaryClosingEmployee.findMany({
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
        include: { kasbonSnapshot: true },
      },
    },
    orderBy: { employeeNameSnapshot: "asc" },
  });
  return employees.map((employee) => ({
    ...employee,
    kasbonAllocations: employee.kasbonAllocations.map(exposeKasbonSnapshot),
  }));
}

export async function getSalaryClosingEmployeeReview(
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
      components: true,
      adjustments: { orderBy: { createdAt: "desc" } },
      kasbonAllocations: {
        where: { status: { not: "VOID" } },
        include: { kasbonSnapshot: true },
      },
    },
  });
  return employee ? {
    ...employee,
    kasbonAllocations: employee.kasbonAllocations.map(exposeKasbonSnapshot),
  } : null;
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
          select: { id: true, exclusionReason: true },
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
    const pendingEmployees = closing.employees.filter(
      (employee) => employee.status !== "REVIEWED",
    );
    if (pendingEmployees.length) {
      throw new SalaryError("SALARY_TEAM_REVIEW_REQUIRED", 409, {
        teamNames: pendingEmployees
          .map((employee) => employee.employeeNameSnapshot)
          .join(", "),
      });
    }
    if (closing.sourceRecords.length) {
      const profileReasons = new Set([
        "PROFILE_NOT_ASSIGNED",
        "PROFILE_NOT_ACTIVE",
        "PROFILE_NOT_EFFECTIVE",
        "PROFILE_SETTING_NOT_FOUND",
      ]);
      throw new SalaryError(
        closing.sourceRecords.some((row) =>
          row.exclusionReason && profileReasons.has(row.exclusionReason)
        )
          ? "SALARY_CLOSING_HAS_PROFILE_WARNINGS"
          : "SALARY_CLOSING_HAS_WARNINGS",
        409,
      );
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
    await tx.salaryAudit.create({
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

export async function reviewSalaryClosingEmployeeAdjustment(
  context: SalaryContext,
  closingId: string,
  closingEmployeeId: string,
) {
  return prisma.$transaction(async (tx) => {
    const employee = await tx.salaryClosingEmployee.findFirst({
      where: {
        id: closingEmployeeId,
        salaryClosingId: closingId,
        tenantId: context.tenantId,
        outletId: context.outletId,
      },
      include: { salaryClosing: { select: { status: true } } },
    });
    if (!employee) throw new SalaryError("SALARY_SCOPE_MISMATCH", 404);
    if (employee.salaryClosing.status !== "CLOSED") {
      throw new SalaryError("SALARY_CLOSING_LOCKED", 409);
    }
    if (employee.status === "REVIEWED") {
      return { ...employee, alreadyReviewed: true };
    }
    if (employee.status !== "PENDING_REVIEW") {
      throw new SalaryError("SALARY_CLOSING_LOCKED", 409);
    }

    const result = await tx.salaryClosingEmployee.updateMany({
      where: {
        id: employee.id,
        salaryClosingId: closingId,
        tenantId: context.tenantId,
        outletId: context.outletId,
        status: "PENDING_REVIEW",
      },
      data: { status: "REVIEWED" },
    });
    if (!result.count) {
      const current = await tx.salaryClosingEmployee.findFirst({
        where: {
          id: employee.id,
          salaryClosingId: closingId,
          tenantId: context.tenantId,
          outletId: context.outletId,
        },
      });
      if (current?.status === "REVIEWED") {
        return { ...current, alreadyReviewed: true };
      }
      throw new SalaryError("SALARY_CLOSING_LOCKED", 409);
    }

    const reviewed = await tx.salaryClosingEmployee.findUniqueOrThrow({
      where: { id: employee.id },
    });
    await tx.salaryAudit.create({
      data: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        salaryClosingId: closingId,
        actorId: context.actorId,
        action: "UPDATE",
        entityType: "SALARY_TEAM_ADJUSTMENT_REVIEWED",
        entityId: employee.id,
        metadata: {
          closingId,
          employeeId: employee.employeeId,
        },
      },
    });
    return { ...reviewed, alreadyReviewed: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function completeSalaryClosing(
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
        employees: {
          include: {
            calculationSnapshot: true,
            adjustments: { where: { voidedAt: null } },
          },
        },
        profileSnapshots: true,
        sourceRecords: {
          where: { isActive: true, calculationStatus: "UNMATCHED" },
          select: { id: true, exclusionReason: true },
        },
        kasbonSnapshots: {
          include: {
            allocations: { where: { status: { not: "VOID" } } },
          },
        },
      },
    });
    if (!closing) throw new SalaryError("SALARY_CLOSING_NOT_FOUND", 404);
    if (closing.status === "COMPLETED") {
      return { ...closing, alreadyCompleted: true };
    }
    if (closing.status !== "CLOSED") {
      throw new SalaryError("SALARY_CLOSING_NOT_REVIEW", 409);
    }
    if (
      !closing.snapshotCapturedAt ||
      !closing.generatedAt ||
      !closing.employees.length ||
      closing.employees.some((employee) => !employee.calculationSnapshot)
    ) {
      throw new SalaryError("SALARY_CLOSING_NOT_GENERATED", 409);
    }
    if (
      closing.sourceRecords.length ||
      closing.employees.some((employee) => employee.calculationWarningCount > 0)
    ) {
      const profileReasons = new Set([
        "PROFILE_NOT_ASSIGNED",
        "PROFILE_NOT_ACTIVE",
        "PROFILE_NOT_EFFECTIVE",
        "PROFILE_SETTING_NOT_FOUND",
      ]);
      throw new SalaryError(
        closing.sourceRecords.some((row) =>
          row.exclusionReason && profileReasons.has(row.exclusionReason)
        )
          ? "SALARY_CLOSING_HAS_PROFILE_WARNINGS"
          : "SALARY_CLOSING_HAS_WARNINGS",
        409,
      );
    }
    const profileIds = new Set(
      closing.profileSnapshots.map((snapshot) => snapshot.salaryProfileId),
    );
    const invalidProfile = closing.employees.some((employee) =>
      !profileIds.has(employee.salaryProfileId)
    ) || closing.profileSnapshots.some((snapshot) =>
      (snapshot.effectiveFrom != null &&
        snapshot.effectiveFrom > closing.periodEnd) ||
      (snapshot.effectiveTo != null &&
        snapshot.effectiveTo < closing.periodStart)
    );
    if (invalidProfile) {
      throw new SalaryError("SALARY_CLOSING_HAS_PROFILE_WARNINGS", 409);
    }
    const invalidAdjustment = closing.employees.some((employee) =>
      employee.adjustments.some((adjustment) =>
        !adjustment.amount.greaterThan(0) || adjustment.reason.trim().length < 5
      )
    );
    const invalidTotal = closing.employees.some((employee) =>
      employee.systemIncomeTotal.lessThan(0) ||
      employee.manualAdditionTotal.lessThan(0) ||
      employee.manualDeductionTotal.lessThan(0) ||
      employee.netSalary.lessThan(0)
    );
    if (invalidAdjustment || invalidTotal) {
      throw new SalaryError("SALARY_CLOSING_INVALID_TOTAL", 409);
    }
    const unresolvedKasbon = closing.kasbonSnapshots.filter(
      (snapshot) => !snapshot.allocations.length,
    );
    if (unresolvedKasbon.length) {
      const teamNames = [...new Set(unresolvedKasbon.map((snapshot) =>
        snapshot.teamName?.trim() || "Team tidak terpetakan"
      ))].join(", ");
      throw new SalaryError("SALARY_KASBON_REVIEW_REQUIRED", 409, {
        teamNames,
      });
    }

    const processedAt = new Date();
    await tx.salaryKasbonAllocation.updateMany({
      where: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        status: "DRAFT",
        closingEmployee: { salaryClosingId: closing.id },
      },
      data: { status: "FINALIZED", finalizedAt: processedAt },
    });
    const updated = await tx.salaryClosing.updateMany({
      where: {
        id: closing.id,
        tenantId: context.tenantId,
        outletId: context.outletId,
        status: "CLOSED",
      },
      data: {
        status: "COMPLETED",
        processedAt,
        processedByUserId: context.actorId,
      },
    });
    if (!updated.count) {
      const current = await tx.salaryClosing.findFirst({
        where: {
          id: closing.id,
          tenantId: context.tenantId,
          outletId: context.outletId,
        },
      });
      if (current?.status === "COMPLETED") {
        return { ...current, alreadyCompleted: true };
      }
      throw new SalaryError("SALARY_CLOSING_NOT_REVIEW", 409);
    }
    await tx.salaryAudit.create({
      data: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        salaryClosingId: closing.id,
        actorId: context.actorId,
        action: "UPDATE",
        entityType: "SALARY_CLOSING_COMPLETED",
        entityId: closing.id,
        metadata: {
          employeeCount: closing.employees.length,
          systemIncomeTotal: closing.employees.reduce(
            (sum, employee) => sum.plus(employee.systemIncomeTotal),
            zero(),
          ).toString(),
          completedAt: processedAt.toISOString(),
        },
      },
    });
    return {
      id: closing.id,
      status: "COMPLETED" as const,
      processedAt,
      alreadyCompleted: false,
    };
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
    await tx.salaryAudit.create({
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
  const closing = await prisma.salaryClosing.findFirst({
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
            include: { kasbonSnapshot: true },
          },
          publicationShares: {
            where: { publishedAt: { not: null } },
            select: {
              publishedAt: true,
              publishedBy: { select: { name: true } },
            },
            orderBy: { publishedAt: "asc" },
            take: 1,
          },
        },
      },
      sourceRecords: {
        where: { isActive: true, calculationStatus: "UNMATCHED" },
      },
    },
  });
  return closing ? {
    ...closing,
    employees: closing.employees.map((employee) => {
      const { publicationShares, ...employeeData } = employee;
      const publication = publicationShares[0] ?? null;
      return {
        ...employeeData,
        publicationStatus: publication
          ? "PUBLISHED" as const
          : "READY" as const,
        publishedAt: publication?.publishedAt ?? null,
        publishedBy: publication?.publishedBy?.name ?? null,
        kasbonAllocations: employeeData.kasbonAllocations.map(
          exposeKasbonSnapshot,
        ),
      };
    }),
  } : null;
}

export { refreshClosingEmployeeTotals };
