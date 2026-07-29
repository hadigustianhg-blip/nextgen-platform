import { z } from "zod";

export const OPERATIONAL_CATEGORIES = [
  "BBM",
  "Kasbon",
  "Parkir",
  "Tol",
  "Pembelian POP",
  "Perawatan Kendaraan",
  "ATK",
  "Konsumsi",
  "Biaya Bongkar Muat",
  "Lainnya",
] as const;

export const CASH_ADVANCE_CATEGORIES = [
  "Pribadi",
  "Transport",
  "Makan",
  "Pinjaman",
  "Lainnya",
] as const;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}, "Tanggal tidak valid.");

const amountSchema = z.union([
  z.number().finite().nonnegative(),
  z.string().trim().regex(/^\d+(\.\d{1,2})?$/),
]);

export const operationalListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
  operationalDate: z.union([dateSchema, z.literal("")]).optional().default(""),
  category: z.union([z.enum(OPERATIONAL_CATEGORIES), z.literal("")]).optional().default(""),
  team: z.string().trim().max(100).optional().default(""),
  search: z.string().trim().max(200).optional().default(""),
});

const expenseBaseSchema = z.object({
  requestKey: z.string().uuid(),
  operationalDate: dateSchema,
  category: z.enum(OPERATIONAL_CATEGORIES),
  amount: amountSchema,
  description: z.string().trim().max(500).nullable().optional(),
  teamName: z.string().trim().max(100).nullable().optional(),
  cashAdvanceCategory: z.enum(CASH_ADVANCE_CATEGORIES).nullable().optional(),
  vehiclePlate: z.string().trim().max(20).nullable().optional(),
});

function validateCategoryFields(
  value: {
    category: string;
    vehiclePlate?: string | null;
    teamName?: string | null;
    cashAdvanceCategory?: string | null;
  },
  context: z.RefinementCtx,
) {
  if (value.category === "BBM" && !value.vehiclePlate) {
    context.addIssue({ code: "custom", path: ["vehiclePlate"], message: "Nomor polisi wajib diisi." });
  }
  if (value.category === "Kasbon") {
    if (!value.teamName) context.addIssue({ code: "custom", path: ["teamName"], message: "Nama team wajib diisi." });
    if (!value.cashAdvanceCategory) context.addIssue({ code: "custom", path: ["cashAdvanceCategory"], message: "Kategori kasbon wajib diisi." });
  }
}

export const expenseInputSchema = expenseBaseSchema.superRefine(validateCategoryFields);
export const expenseUpdateSchema = expenseBaseSchema
  .omit({ operationalDate: true })
  .superRefine(validateCategoryFields);

export const voidExpenseSchema = z.object({
  requestKey: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export const closeOperationalSchema = z.object({
  requestKey: z.string().uuid(),
  operationalDate: dateSchema,
  physicalCash: amountSchema,
});

export const reopenOperationalSchema = z.object({
  requestKey: z.string().uuid(),
  operationalDate: dateSchema,
  reason: z.string().trim().min(3).max(500),
});
