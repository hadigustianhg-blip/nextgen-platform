import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  canonicalDispatchText,
  getActiveDispatchRecords,
} from "@/modules/delivery-settlement/active-dispatch-dataset";
import {
  calculateEmployeeSalary,
  createSalaryEmployeeMatcher,
  resolveSalaryAssignmentOnDate,
  type SalaryCalculationSetting,
  type SalaryDispatchSource,
  type SalaryPickupSource,
} from "./salary.calculation";
import { SALARY_DISPATCH_STATUS } from "./salary.domain";
import { canonicalizeSalaryPickupSettlement } from "./salary.snapshot.service";
import type { SalaryScope } from "./salary.service";

const dateOnly = (value: string) => new Date(`${value}T00:00:00.000Z`);
const dateKey = (value: Date) => value.toISOString().slice(0, 10);
const zero = () => new Prisma.Decimal(0);

type PreviewEmployee = Awaited<ReturnType<typeof loadSalaryPreviewSources>>["employees"][number];
type PreviewAssignment = PreviewEmployee["assignments"][number];

const settingForCalculation = (
  assignment: PreviewAssignment,
): SalaryCalculationSetting | null => {
  const setting = assignment.salaryProfile.setting;
  if (!setting) return null;
  return {
    profileId: assignment.salaryProfile.id,
    profileCode: assignment.salaryProfile.code,
    profileVersion: assignment.salaryProfile.version,
    basicDailySalary: setting.basicDailySalary,
    fixedAllowance: setting.fixedAllowance,
    deliveryPerKgAmount: setting.deliveryPerKgAmount,
    deliveryPerKgMinWeight: setting.deliveryPerKgMinWeight,
    deliveryPerKgMaxWeight: setting.deliveryPerKgMaxWeight,
    deliveryPerWaybillAmount: setting.deliveryPerWaybillAmount,
    deliveryPerWaybillMinWeight: setting.deliveryPerWaybillMinWeight,
    deliveryPerWaybillMaxWeight: setting.deliveryPerWaybillMaxWeight,
    pickupRegularRevenuePercentage: setting.pickupRegularRevenuePercentage,
    pickupRegularPerWaybillAmount: setting.pickupRegularPerWaybillAmount,
    pickupMarketplacePerWaybillAmount:
      setting.pickupMarketplacePerWaybillAmount,
    dailyFuelMinDeliveryWaybill: setting.dailyFuelMinDeliveryWaybill,
    dailyFuelAmount: setting.dailyFuelAmount,
    dailyExtraMinDeliveryWaybill: setting.dailyExtraMinDeliveryWaybill,
    dailyExtraAmount: setting.dailyExtraAmount,
  };
};

async function loadSalaryPreviewSources(
  scope: SalaryScope,
  periodStart: Date,
  periodEnd: Date,
) {
  const [employees, pickups, dispatches, kasbons] = await Promise.all([
    prisma.salaryEmployee.findMany({
      where: {
        tenantId: scope.tenantId,
        outletId: scope.outletId,
        status: "ACTIVE",
      },
      include: {
        aliases: { where: { isActive: true } },
        assignments: {
          include: { salaryProfile: { include: { setting: true } } },
          orderBy: { effectiveFrom: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.masterPickup.findMany({
      where: {
        tenantId: scope.tenantId,
        outletId: scope.outletId,
        operationalDate: { gte: periodStart, lte: periodEnd },
        syncStatus: "NORMALIZED",
      },
      include: { rawPickup: { select: { settlementRaw: true } } },
      orderBy: [{ operationalDate: "asc" }, { id: "asc" }],
    }),
    getActiveDispatchRecords({
      tenantId: scope.tenantId,
      outletId: scope.outletId,
      periodStart,
      periodEnd,
      status: SALARY_DISPATCH_STATUS,
    }),
    prisma.operationalExpense.findMany({
      where: {
        tenantId: scope.tenantId,
        outletId: scope.outletId,
        operationalDate: { gte: periodStart, lte: periodEnd },
        status: "VALID",
        category: { equals: "Kasbon", mode: "insensitive" },
      },
      select: { id: true, operationalDate: true, teamName: true },
      orderBy: [{ operationalDate: "asc" }, { id: "asc" }],
    }),
  ]);
  return { employees, pickups, dispatches, kasbons };
}

export async function getSalaryMonthlyPreview(
  scope: SalaryScope,
  input: { startDate: string; endDate: string },
) {
  const periodStart = dateOnly(input.startDate);
  const periodEnd = dateOnly(input.endDate);
  const { employees, pickups, dispatches, kasbons } = await loadSalaryPreviewSources(
    scope,
    periodStart,
    periodEnd,
  );
  const matchEmployee = createSalaryEmployeeMatcher(employees);
  const employeeById = new Map(employees.map((employee) => [
    employee.id,
    employee,
  ]));
  const pickupsByEmployee = new Map<string, SalaryPickupSource[]>();
  const dispatchesByEmployee = new Map<string, SalaryDispatchSource[]>();
  const touchedEmployeeIds = new Set<string>();
  const mappedEmployeeIds = new Set<string>();

  for (const source of pickups) {
    const match = matchEmployee(source.staffName, "PICKUP");
    if (!match.employeeId) continue;
    touchedEmployeeIds.add(match.employeeId);
    const employee = employeeById.get(match.employeeId)!;
    const resolved = resolveSalaryAssignmentOnDate(
      employee.assignments,
      source.operationalDate,
      employee.division,
    );
    const setting = resolved.assignment
      ? settingForCalculation(resolved.assignment)
      : null;
    if (!setting) continue;
    mappedEmployeeIds.add(employee.id);
    pickupsByEmployee.set(employee.id, [
      ...(pickupsByEmployee.get(employee.id) ?? []),
      {
        id: source.id,
        sourceKey: source.id,
        employeeNameRaw: source.staffName,
        date: dateKey(source.operationalDate),
        waybill: source.waybillNo,
        settlement: canonicalizeSalaryPickupSettlement(
          source.rawPickup.settlementRaw,
        ),
        freight: source.freightAmount,
        setting,
      },
    ]);
  }

  for (const source of dispatches) {
    const match = matchEmployee(source.courierNameRaw, "DISPATCH");
    if (!match.employeeId) continue;
    touchedEmployeeIds.add(match.employeeId);
    const employee = employeeById.get(match.employeeId)!;
    const resolved = resolveSalaryAssignmentOnDate(
      employee.assignments,
      source.operationalDate,
      employee.division,
    );
    const setting = resolved.assignment
      ? settingForCalculation(resolved.assignment)
      : null;
    if (!setting) continue;
    mappedEmployeeIds.add(employee.id);
    dispatchesByEmployee.set(employee.id, [
      ...(dispatchesByEmployee.get(employee.id) ?? []),
      {
        id: source.id,
        sourceKey: source.id,
        employeeNameRaw: source.courierNameRaw,
        date: dateKey(source.operationalDate),
        waybill: canonicalDispatchText(source.waybillNo),
        status: SALARY_DISPATCH_STATUS,
        weight: source.chargeWeight,
        setting,
      },
    ]);
  }

  for (const kasbon of kasbons) {
    const match = matchEmployee(kasbon.teamName, "PICKUP");
    if (match.employeeId) touchedEmployeeIds.add(match.employeeId);
  }

  for (const employee of employees) {
    const resolution = resolveSalaryAssignmentOnDate(
      employee.assignments,
      periodEnd,
      employee.division,
    );
    const setting = resolution.assignment
      ? settingForCalculation(resolution.assignment)
      : null;
    if (
      setting &&
      (
        setting.basicDailySalary?.greaterThan(0) ||
        setting.fixedAllowance?.greaterThan(0)
      )
    ) {
      touchedEmployeeIds.add(employee.id);
      mappedEmployeeIds.add(employee.id);
    }
  }

  const rows = [...touchedEmployeeIds]
    .map((employeeId) => {
      const employee = employeeById.get(employeeId)!;
      const calculated = calculateEmployeeSalary({
        pickups: pickupsByEmployee.get(employeeId) ?? [],
        dispatches: dispatchesByEmployee.get(employeeId) ?? [],
      });
      const addition = zero();
      const manualDeduction = zero();
      const kasbon = zero();
      const totalDeduction = manualDeduction.plus(kasbon);
      const net = calculated.systemIncomeTotal
        .plus(addition)
        .minus(totalDeduction);
      return {
        employeeId: employee.id,
        name: employee.name,
        division: employee.division,
        workDayCount: calculated.workDates.length,
        pickupCount: calculated.pickupCount,
        dispatchCount: calculated.dispatchCount,
        systemIncomeTotal: calculated.systemIncomeTotal.toString(),
        manualAdditionTotal: addition.toString(),
        manualDeductionTotal: manualDeduction.toString(),
        kasbonDeductionTotal: kasbon.toString(),
        estimatedNetTotal: net.toString(),
        profileStatus: mappedEmployeeIds.has(employee.id)
          ? "MAPPED"
          : "UNMAPPED",
        components: calculated.components.map((component) => ({
          code: component.code,
          name: component.name,
          quantity: component.quantity.toString(),
          rate: component.rate.toString(),
          amount: component.amount.toString(),
        })),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "id-ID"));

  const totals = rows.reduce((result, row) => ({
    workDayCount: result.workDayCount + row.workDayCount,
    pickupCount: result.pickupCount + row.pickupCount,
    dispatchCount: result.dispatchCount + row.dispatchCount,
    systemIncomeTotal: result.systemIncomeTotal.plus(row.systemIncomeTotal),
    manualAdditionTotal: result.manualAdditionTotal.plus(row.manualAdditionTotal),
    manualDeductionTotal: result.manualDeductionTotal.plus(row.manualDeductionTotal),
    kasbonDeductionTotal: result.kasbonDeductionTotal.plus(row.kasbonDeductionTotal),
    estimatedNetTotal: result.estimatedNetTotal.plus(row.estimatedNetTotal),
  }), {
    workDayCount: 0,
    pickupCount: 0,
    dispatchCount: 0,
    systemIncomeTotal: zero(),
    manualAdditionTotal: zero(),
    manualDeductionTotal: zero(),
    kasbonDeductionTotal: zero(),
    estimatedNetTotal: zero(),
  });

  return {
    period: input,
    summary: {
      teamCount: rows.length,
      workDayCount: totals.workDayCount,
      pickupCount: totals.pickupCount,
      dispatchCount: totals.dispatchCount,
      systemIncomeTotal: totals.systemIncomeTotal.toString(),
      manualAdditionTotal: totals.manualAdditionTotal.toString(),
      manualDeductionTotal: totals.manualDeductionTotal.toString(),
      kasbonDeductionTotal: totals.kasbonDeductionTotal.toString(),
      estimatedNetTotal: totals.estimatedNetTotal.toString(),
    },
    data: rows,
  };
}
