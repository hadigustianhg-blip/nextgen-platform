import { Prisma } from "@prisma/client";
import {
  isSalaryEligibleDispatchStatus,
  isSalarySettlement,
} from "./salary.domain";

const zero = () => new Prisma.Decimal(0);
const money = (value: Prisma.Decimal.Value | null | undefined) =>
  new Prisma.Decimal(value ?? 0).toDecimalPlaces(
    2,
    Prisma.Decimal.ROUND_HALF_UP,
  );
const positive = (value: Prisma.Decimal | null | undefined) =>
  Boolean(value?.greaterThan(0));
const inRange = (
  value: Prisma.Decimal,
  min: Prisma.Decimal | null | undefined,
  max: Prisma.Decimal | null | undefined,
) => min != null && max != null &&
  value.greaterThanOrEqualTo(min) && value.lessThanOrEqualTo(max);

export function normalizeSalaryEmployeeName(
  value: string | null | undefined,
) {
  return value?.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID") ?? "";
}

type EmployeeMatchInput = {
  id: string;
  name: string;
  aliases?: Array<{
    aliasName: string;
    sourceType: "PICKUP" | "DISPATCH" | "BOTH";
    isActive: boolean;
  }>;
};

export function createSalaryEmployeeMatcher(employees: EmployeeMatchInput[]) {
  const exact = new Map<string, string[]>();
  const aliases = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, key: string, employeeId: string) => {
    if (!key) return;
    map.set(key, [...(map.get(key) ?? []), employeeId]);
  };
  for (const employee of employees) {
    add(exact, normalizeSalaryEmployeeName(employee.name), employee.id);
    for (const alias of employee.aliases ?? []) {
      if (!alias.isActive) continue;
      add(
        aliases,
        `${alias.sourceType}:${normalizeSalaryEmployeeName(alias.aliasName)}`,
        employee.id,
      );
    }
  }
  return (
    name: string | null | undefined,
    sourceType: "PICKUP" | "DISPATCH",
  ) => {
    const normalized = normalizeSalaryEmployeeName(name);
    const aliasMatches = new Set([
      ...(aliases.get(`${sourceType}:${normalized}`) ?? []),
      ...(aliases.get(`BOTH:${normalized}`) ?? []),
    ]);
    if (aliasMatches.size === 1) {
      return { employeeId: [...aliasMatches][0], reason: null };
    }
    if (aliasMatches.size > 1) {
      return { employeeId: null, reason: "AMBIGUOUS_ALIAS" };
    }
    const exactMatches = new Set(exact.get(normalized) ?? []);
    if (exactMatches.size === 1) {
      return { employeeId: [...exactMatches][0], reason: null };
    }
    return {
      employeeId: null,
      reason: exactMatches.size > 1 ? "AMBIGUOUS_NAME" : "EMPLOYEE_NOT_MAPPED",
    };
  };
}

export type SalaryCalculationSetting = {
  profileId: string;
  profileCode: string;
  profileVersion: number;
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
};

type BaseSource = {
  id: string;
  sourceKey?: string;
  employeeNameRaw?: string | null;
  date: string;
  waybill: string;
  setting: SalaryCalculationSetting;
};

export type SalaryPickupSource = BaseSource & {
  settlement: string | null;
  freight: Prisma.Decimal;
};

export type SalaryDispatchSource = BaseSource & {
  status: string | null;
  weight: Prisma.Decimal;
};

export type SalaryCalculatedComponent = {
  code: string;
  name: string;
  sourceType:
    | "BASIC"
    | "FIXED_ALLOWANCE"
    | "DELIVERY_PER_KG"
    | "DELIVERY_PER_WAYBILL"
    | "PICKUP_REGULAR_PERCENTAGE"
    | "PICKUP_REGULAR_PER_WAYBILL"
    | "PICKUP_MARKETPLACE_PER_WAYBILL"
    | "DAILY_FUEL"
    | "DAILY_EXTRA";
  profileId: string;
  quantity: Prisma.Decimal;
  rate: Prisma.Decimal;
  amount: Prisma.Decimal;
  metadata: Record<string, unknown>;
};

export type SalaryCalculatedSource = {
  sourceType: "PICKUP" | "DISPATCH";
  sourceRecordId: string;
  calculationStatus: "INCLUDED" | "EXCLUDED";
  exclusionReason: string | null;
  calculationType: string | null;
  rate: Prisma.Decimal | null;
  amount: Prisma.Decimal | null;
};

const componentNames = {
  BASIC: "Basic Salary",
  FIXED_ALLOWANCE: "Tunjangan Tetap",
  DELIVERY_PER_KG: "Delivery Per Kg",
  DELIVERY_PER_WAYBILL: "Delivery Per Waybill",
  PICKUP_REGULAR_PERCENTAGE: "Pickup Reguler Omset",
  PICKUP_REGULAR_PER_WAYBILL: "Pickup Reguler Per Waybill",
  PICKUP_MARKETPLACE_PER_WAYBILL: "Pickup Marketplace",
  DAILY_FUEL: "Insentif BBM",
  DAILY_EXTRA: "Extra Delivery",
} as const;

export function validateSalaryDeliveryRanges(
  setting: SalaryCalculationSetting,
) {
  const kgMin = setting.deliveryPerKgMinWeight;
  const kgMax = setting.deliveryPerKgMaxWeight;
  const wbMin = setting.deliveryPerWaybillMinWeight;
  const wbMax = setting.deliveryPerWaybillMaxWeight;
  if (
    kgMin && kgMax && wbMin && wbMax &&
    kgMin.lessThanOrEqualTo(wbMax) && wbMin.lessThanOrEqualTo(kgMax)
  ) {
    throw new Error(`OVERLAPPING_DELIVERY_RANGE:${setting.profileCode}`);
  }
}

export function calculateEmployeeSalary(input: {
  pickups: SalaryPickupSource[];
  dispatches: SalaryDispatchSource[];
}) {
  const pickups = [...new Map(
    input.pickups.map((source) => [source.id, source]),
  ).values()];
  const dispatches = [...new Map(
    input.dispatches.map((source) => [source.id, source]),
  ).values()];
  const components: SalaryCalculatedComponent[] = [];
  const sources: SalaryCalculatedSource[] = [];
  const validDispatches = dispatches.filter((source) =>
    isSalaryEligibleDispatchStatus(source.status)
  );
  const settings = new Map<string, SalaryCalculationSetting>();
  for (const source of [...pickups, ...validDispatches]) {
    settings.set(source.setting.profileId, source.setting);
  }
  for (const setting of settings.values()) validateSalaryDeliveryRanges(setting);

  const workDatesByProfile = new Map<string, Set<string>>();
  for (const source of [...pickups, ...validDispatches]) {
    const dates = workDatesByProfile.get(source.setting.profileId) ?? new Set();
    dates.add(source.date);
    workDatesByProfile.set(source.setting.profileId, dates);
  }

  const addComponent = (
    setting: SalaryCalculationSetting,
    sourceType: SalaryCalculatedComponent["sourceType"],
    quantity: Prisma.Decimal,
    rate: Prisma.Decimal,
    amount: Prisma.Decimal,
    metadata: Record<string, unknown>,
  ) => {
    if (!amount.greaterThan(0)) return;
    components.push({
      code: `${sourceType}:${setting.profileCode}:v${setting.profileVersion}`,
      name: componentNames[sourceType],
      sourceType,
      profileId: setting.profileId,
      quantity,
      rate,
      amount: money(amount),
      metadata,
    });
  };

  for (const setting of settings.values()) {
    const workDates = [...(workDatesByProfile.get(setting.profileId) ?? [])]
      .sort();
    if (positive(setting.basicDailySalary) && workDates.length) {
      const quantity = new Prisma.Decimal(workDates.length);
      addComponent(
        setting,
        "BASIC",
        quantity,
        setting.basicDailySalary!,
        quantity.times(setting.basicDailySalary!),
        { workDates, profileVersion: setting.profileVersion, method: "ACTIVITY" },
      );
    }
  }
  const latestActivity = [...pickups, ...validDispatches]
    .sort((left, right) => right.date.localeCompare(left.date))[0];
  if (
    latestActivity &&
    positive(latestActivity.setting.fixedAllowance) &&
    workDatesByProfile.size
  ) {
    addComponent(
      latestActivity.setting,
      "FIXED_ALLOWANCE",
      new Prisma.Decimal(1),
      latestActivity.setting.fixedAllowance!,
      latestActivity.setting.fixedAllowance!,
      {
        minimumActiveDayMet: true,
        profileSelection: "LATEST_ACTIVITY_DATE",
      },
    );
  }

  const deliveryKg = new Map<string, {
    setting: SalaryCalculationSetting;
    quantity: Prisma.Decimal;
    amount: Prisma.Decimal;
  }>();
  const deliveryWaybill = new Map<string, {
    setting: SalaryCalculationSetting;
    quantity: Prisma.Decimal;
    amount: Prisma.Decimal;
  }>();
  for (const source of dispatches) {
    if (!isSalaryEligibleDispatchStatus(source.status)) {
      sources.push({
        sourceType: "DISPATCH",
        sourceRecordId: source.id,
        calculationStatus: "EXCLUDED",
        exclusionReason: "DELIVERY_STATUS_NOT_ELIGIBLE",
        calculationType: null,
        rate: null,
        amount: null,
      });
      continue;
    }
    if (source.weight.lessThan(0)) {
      sources.push({
        sourceType: "DISPATCH",
        sourceRecordId: source.id,
        calculationStatus: "EXCLUDED",
        exclusionReason: "INVALID_WEIGHT",
        calculationType: null,
        rate: null,
        amount: null,
      });
      continue;
    }
    const setting = source.setting;
    const perWaybill = inRange(
      source.weight,
      setting.deliveryPerWaybillMinWeight,
      setting.deliveryPerWaybillMaxWeight,
    ) && positive(setting.deliveryPerWaybillAmount);
    const perKg = inRange(
      source.weight,
      setting.deliveryPerKgMinWeight,
      setting.deliveryPerKgMaxWeight,
    ) && positive(setting.deliveryPerKgAmount);
    if (!perWaybill && !perKg) {
      sources.push({
        sourceType: "DISPATCH",
        sourceRecordId: source.id,
        calculationStatus: "EXCLUDED",
        exclusionReason: "OUTSIDE_WEIGHT_RANGE",
        calculationType: null,
        rate: null,
        amount: null,
      });
      continue;
    }
    if (perWaybill) {
      const amount = money(setting.deliveryPerWaybillAmount);
      const aggregate = deliveryWaybill.get(setting.profileId) ?? {
        setting, quantity: zero(), amount: zero(),
      };
      aggregate.quantity = aggregate.quantity.plus(1);
      aggregate.amount = aggregate.amount.plus(amount);
      deliveryWaybill.set(setting.profileId, aggregate);
      sources.push({
        sourceType: "DISPATCH",
        sourceRecordId: source.id,
        calculationStatus: "INCLUDED",
        exclusionReason: null,
        calculationType: "DELIVERY_PER_WAYBILL",
        rate: setting.deliveryPerWaybillAmount,
        amount,
      });
    } else {
      const amount = money(source.weight.times(setting.deliveryPerKgAmount!));
      const aggregate = deliveryKg.get(setting.profileId) ?? {
        setting, quantity: zero(), amount: zero(),
      };
      aggregate.quantity = aggregate.quantity.plus(source.weight);
      aggregate.amount = aggregate.amount.plus(amount);
      deliveryKg.set(setting.profileId, aggregate);
      sources.push({
        sourceType: "DISPATCH",
        sourceRecordId: source.id,
        calculationStatus: "INCLUDED",
        exclusionReason: null,
        calculationType: "DELIVERY_PER_KG",
        rate: setting.deliveryPerKgAmount,
        amount,
      });
    }
  }
  for (const aggregate of deliveryWaybill.values()) {
    addComponent(
      aggregate.setting,
      "DELIVERY_PER_WAYBILL",
      aggregate.quantity,
      aggregate.setting.deliveryPerWaybillAmount!,
      aggregate.amount,
      { waybillCount: aggregate.quantity.toNumber() },
    );
  }
  for (const aggregate of deliveryKg.values()) {
    addComponent(
      aggregate.setting,
      "DELIVERY_PER_KG",
      aggregate.quantity,
      aggregate.setting.deliveryPerKgAmount!,
      aggregate.amount,
      { eligibleWeight: aggregate.quantity.toString() },
    );
  }

  const pickupTotals = new Map<string, {
    setting: SalaryCalculationSetting;
    regularCount: number;
    regularFreight: Prisma.Decimal;
    regularPercentageAmount: Prisma.Decimal;
    marketplaceCount: number;
    settlements: Record<string, number>;
  }>();
  for (const source of pickups) {
    const setting = source.setting;
    const total = pickupTotals.get(setting.profileId) ?? {
      setting,
      regularCount: 0,
      regularFreight: zero(),
      regularPercentageAmount: zero(),
      marketplaceCount: 0,
      settlements: {},
    };
    const regular = isSalarySettlement(source.settlement, "DFOD") ||
      isSalarySettlement(source.settlement, "Tunai");
    const marketplace = isSalarySettlement(source.settlement, "Bulanan");
    if (!regular && !marketplace) {
      sources.push({
        sourceType: "PICKUP",
        sourceRecordId: source.id,
        calculationStatus: "EXCLUDED",
        exclusionReason: "SETTLEMENT_NOT_ELIGIBLE",
        calculationType: null,
        rate: null,
        amount: null,
      });
      continue;
    }
    if (regular) {
      total.regularCount += 1;
      const canonical = isSalarySettlement(source.settlement, "DFOD")
        ? "DFOD"
        : "Tunai";
      total.settlements[canonical] = (total.settlements[canonical] ?? 0) + 1;
      if (source.freight.greaterThanOrEqualTo(0)) {
        total.regularFreight = total.regularFreight.plus(source.freight);
        if (positive(setting.pickupRegularRevenuePercentage)) {
          total.regularPercentageAmount =
            total.regularPercentageAmount.plus(money(
              source.freight
                .times(setting.pickupRegularRevenuePercentage!)
                .dividedBy(100),
            ));
        }
      }
      const percentageEligible = source.freight.greaterThanOrEqualTo(0) &&
        positive(setting.pickupRegularRevenuePercentage);
      const perWaybillEligible =
        positive(setting.pickupRegularPerWaybillAmount);
      const sourceAmount = (percentageEligible
        ? money(source.freight
          .times(setting.pickupRegularRevenuePercentage!)
          .dividedBy(100))
        : zero()).plus(
          perWaybillEligible ? setting.pickupRegularPerWaybillAmount! : zero(),
        );
      sources.push({
        sourceType: "PICKUP",
        sourceRecordId: source.id,
        calculationStatus: percentageEligible || perWaybillEligible
          ? "INCLUDED"
          : "EXCLUDED",
        exclusionReason: source.freight.lessThan(0)
          ? "INVALID_FREIGHT_FOR_PERCENTAGE"
          : percentageEligible || perWaybillEligible
            ? null
            : "RATE_NOT_CONFIGURED",
        calculationType: percentageEligible && perWaybillEligible
          ? "PICKUP_REGULAR_PERCENTAGE_AND_PER_WAYBILL"
          : percentageEligible
            ? "PICKUP_REGULAR_PERCENTAGE"
            : perWaybillEligible
              ? "PICKUP_REGULAR_PER_WAYBILL"
              : null,
        rate: percentageEligible
          ? setting.pickupRegularRevenuePercentage
          : setting.pickupRegularPerWaybillAmount,
        amount: sourceAmount.greaterThan(0) ? money(sourceAmount) : null,
      });
    } else {
      total.marketplaceCount += 1;
      total.settlements.Bulanan = (total.settlements.Bulanan ?? 0) + 1;
      sources.push({
        sourceType: "PICKUP",
        sourceRecordId: source.id,
        calculationStatus:
          positive(setting.pickupMarketplacePerWaybillAmount)
            ? "INCLUDED"
            : "EXCLUDED",
        exclusionReason:
          positive(setting.pickupMarketplacePerWaybillAmount)
            ? null
            : "RATE_NOT_CONFIGURED",
        calculationType:
          positive(setting.pickupMarketplacePerWaybillAmount)
            ? "PICKUP_MARKETPLACE_PER_WAYBILL"
            : null,
        rate: setting.pickupMarketplacePerWaybillAmount,
        amount: positive(setting.pickupMarketplacePerWaybillAmount)
          ? money(setting.pickupMarketplacePerWaybillAmount)
          : null,
      });
    }
    pickupTotals.set(setting.profileId, total);
  }
  for (const total of pickupTotals.values()) {
    if (positive(total.setting.pickupRegularRevenuePercentage)) {
      addComponent(
        total.setting,
        "PICKUP_REGULAR_PERCENTAGE",
        total.regularFreight,
        total.setting.pickupRegularRevenuePercentage!,
        total.regularPercentageAmount,
        {
          totalEligibleFreight: total.regularFreight.toString(),
          waybillCount: total.regularCount,
          settlementBreakdown: total.settlements,
        },
      );
    }
    if (
      positive(total.setting.pickupRegularPerWaybillAmount) &&
      total.regularCount
    ) {
      const quantity = new Prisma.Decimal(total.regularCount);
      addComponent(
        total.setting,
        "PICKUP_REGULAR_PER_WAYBILL",
        quantity,
        total.setting.pickupRegularPerWaybillAmount!,
        quantity.times(total.setting.pickupRegularPerWaybillAmount!),
        { waybillCount: total.regularCount },
      );
    }
    if (
      positive(total.setting.pickupMarketplacePerWaybillAmount) &&
      total.marketplaceCount
    ) {
      const quantity = new Prisma.Decimal(total.marketplaceCount);
      addComponent(
        total.setting,
        "PICKUP_MARKETPLACE_PER_WAYBILL",
        quantity,
        total.setting.pickupMarketplacePerWaybillAmount!,
        quantity.times(total.setting.pickupMarketplacePerWaybillAmount!),
        { waybillCount: total.marketplaceCount, settlement: "Bulanan" },
      );
    }
  }

  const dispatchDaily = new Map<string, {
    setting: SalaryCalculationSetting;
    dates: Map<string, number>;
  }>();
  for (const source of validDispatches) {
    const current = dispatchDaily.get(source.setting.profileId) ?? {
      setting: source.setting, dates: new Map(),
    };
    current.dates.set(source.date, (current.dates.get(source.date) ?? 0) + 1);
    dispatchDaily.set(source.setting.profileId, current);
  }
  for (const daily of dispatchDaily.values()) {
    const fuelDates = [...daily.dates].filter(([, count]) =>
      daily.setting.dailyFuelMinDeliveryWaybill != null &&
      count >= daily.setting.dailyFuelMinDeliveryWaybill
    );
    if (fuelDates.length && positive(daily.setting.dailyFuelAmount)) {
      const quantity = new Prisma.Decimal(fuelDates.length);
      addComponent(
        daily.setting,
        "DAILY_FUEL",
        quantity,
        daily.setting.dailyFuelAmount!,
        quantity.times(daily.setting.dailyFuelAmount!),
        {
          eligibleDates: fuelDates.map(([date]) => date),
          dispatchCounts: Object.fromEntries(daily.dates),
          threshold: daily.setting.dailyFuelMinDeliveryWaybill,
        },
      );
    }
    const extraDates = [...daily.dates].filter(([, count]) =>
      daily.setting.dailyExtraMinDeliveryWaybill != null &&
      count >= daily.setting.dailyExtraMinDeliveryWaybill
    );
    if (extraDates.length && positive(daily.setting.dailyExtraAmount)) {
      const quantity = new Prisma.Decimal(extraDates.length);
      addComponent(
        daily.setting,
        "DAILY_EXTRA",
        quantity,
        daily.setting.dailyExtraAmount!,
        quantity.times(daily.setting.dailyExtraAmount!),
        {
          eligibleDates: extraDates.map(([date]) => date),
          dispatchCounts: Object.fromEntries(daily.dates),
          threshold: daily.setting.dailyExtraMinDeliveryWaybill,
        },
      );
    }
  }

  const workDates = new Set(
    [...pickups, ...validDispatches].map((source) => source.date),
  );
  return {
    components,
    sources,
    workDates: [...workDates].sort(),
    systemIncomeTotal: components.reduce(
      (sum, component) => sum.plus(component.amount),
      zero(),
    ),
    pickupCount: pickups.length,
    dispatchCount: validDispatches.length,
  };
}
