import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const division = z.enum([
  "ADMIN", "ADMIN_OPS", "SALES", "THREE_WHEEL_DRIVER", "MOTORIST", "DRIVER",
]);
const nullableNonNegative = z.number().finite().nonnegative().nullable().optional();
const nullableThreshold = z.number().int().nonnegative().nullable().optional();

export const salaryProfileSchema = z.object({
  code: z.string().trim().min(1).max(50).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(150),
  division,
  description: z.string().trim().max(500).nullable().optional(),
  effectiveFrom: date,
  effectiveTo: date.nullable().optional(),
  version: z.number().int().min(1).max(999).default(1),
  basicDailySalary: nullableNonNegative,
  overtimeRate: nullableNonNegative,
  fixedAllowance: nullableNonNegative,
  deliveryPerKgAmount: nullableNonNegative,
  deliveryPerKgMinWeight: nullableNonNegative,
  deliveryPerKgMaxWeight: nullableNonNegative,
  deliveryPerWaybillAmount: nullableNonNegative,
  deliveryPerWaybillMinWeight: nullableNonNegative,
  deliveryPerWaybillMaxWeight: nullableNonNegative,
  pickupRegularRevenuePercentage: nullableNonNegative,
  pickupRegularPerWaybillAmount: nullableNonNegative,
  pickupMarketplacePerWaybillAmount: nullableNonNegative,
  dailyFuelMinDeliveryWaybill: nullableThreshold,
  dailyFuelAmount: nullableNonNegative,
  dailyExtraMinDeliveryWaybill: nullableThreshold,
  dailyExtraAmount: nullableNonNegative,
}).superRefine((value, context) => {
  if (value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
    context.addIssue({
      code: "custom", path: ["effectiveTo"],
      message: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
    });
  }
  if ((value.pickupRegularRevenuePercentage ?? 0) > 100) {
    context.addIssue({
      code: "custom", path: ["pickupRegularRevenuePercentage"],
      message: "Persentase maksimal 100%.",
    });
  }
  const ranges = [
    ["deliveryPerKgMinWeight", "deliveryPerKgMaxWeight"],
    ["deliveryPerWaybillMinWeight", "deliveryPerWaybillMaxWeight"],
  ] as const;
  for (const [minKey, maxKey] of ranges) {
    const min = value[minKey];
    const max = value[maxKey];
    if (min != null && max != null && max < min) {
      context.addIssue({
        code: "custom", path: [maxKey],
        message: "Nilai maksimal tidak boleh lebih kecil dari minimal.",
      });
    }
  }
  const kgMin = value.deliveryPerKgMinWeight;
  const kgMax = value.deliveryPerKgMaxWeight;
  const wbMin = value.deliveryPerWaybillMinWeight;
  const wbMax = value.deliveryPerWaybillMaxWeight;
  if (
    kgMin != null && kgMax != null && wbMin != null && wbMax != null &&
    kgMin <= wbMax && wbMin <= kgMax
  ) {
    context.addIssue({
      code: "custom", path: ["deliveryPerWaybillMinWeight"],
      message: "Range delivery per kg dan per waybill tidak boleh overlap.",
    });
  }
});

export const salaryTeamQuerySchema = z.object({
  search: z.string().trim().max(100).optional().default(""),
  division: division.or(z.literal("")).optional().default(""),
  status: z.enum(["ACTIVE", "INACTIVE"]).or(z.literal("")).optional().default(""),
});

export const salaryTeamSchema = z.object({
  name: z.string().trim().min(1).max(150),
  division,
  whatsapp: z.string().trim().max(30).nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

export const salaryAssignmentSchema = z.object({
  salaryProfileId: z.string().uuid(),
  effectiveFrom: date,
  effectiveTo: date.nullable().optional(),
}).refine(
  (value) => !value.effectiveTo || value.effectiveTo >= value.effectiveFrom,
  { path: ["effectiveTo"], message: "Periode assignment tidak valid." },
);

export const salaryClosingSchema = z.object({
  periodStart: date,
  periodEnd: date,
  notes: z.string().trim().max(1000).nullable().optional(),
}).refine((value) => value.periodEnd >= value.periodStart, {
  path: ["periodEnd"],
  message: "Tanggal akhir tidak boleh sebelum tanggal awal.",
});

export const salaryPreviewQuerySchema = z.object({
  startDate: date,
  endDate: date,
}).superRefine((value, context) => {
  if (value.endDate < value.startDate) {
    context.addIssue({
      code: "custom", path: ["endDate"],
      message: "Tanggal akhir tidak boleh sebelum tanggal awal.",
    });
    return;
  }
  const start = Date.parse(`${value.startDate}T00:00:00.000Z`);
  const end = Date.parse(`${value.endDate}T00:00:00.000Z`);
  const totalDays = Math.floor((end - start) / 86_400_000) + 1;
  if (totalDays > 366) {
    context.addIssue({
      code: "custom", path: ["endDate"],
      message: "Periode preview maksimal 366 hari.",
    });
  }
});

export const salaryAdjustmentSchema = z.object({
  salaryClosingEmployeeId: z.string().uuid(),
  type: z.enum(["ADDITION", "DEDUCTION"]),
  category: z.string().trim().min(1).max(100),
  amount: z.number().finite().positive(),
  reason: z.string().trim().min(5).max(500),
});

export const salaryAdjustmentVoidSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});

export const salaryClosingVoidSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});

export const salaryKasbonAllocationSchema = z.object({
  operationalExpenseId: z.string().uuid(),
  amount: z.number().finite().positive(),
});

export const salaryKasbonAllocationUpdateSchema = z.object({
  amount: z.number().finite().positive(),
});

export const salaryAliasSchema = z.object({
  salaryEmployeeId: z.string().uuid(),
  sourceType: z.enum(["PICKUP", "DISPATCH", "BOTH"]),
  aliasName: z.string().trim().min(1).max(150),
});
