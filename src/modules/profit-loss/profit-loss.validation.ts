import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const direction = z.enum(["INCOME", "EXPENSE"]);
const source = z.enum(["JFS", "NEXTGEN_SYSTEM", "MANUAL", "ADJUSTMENT"]);

export const profitLossQuerySchema = z.object({
  startDate: date,
  endDate: date,
  search: z.string().trim().max(120).optional().default(""),
  direction: direction.optional(),
  source: source.optional(),
  category: z.string().trim().max(100).optional().default(""),
  sort: z.enum(["newest", "oldest"]).optional().default("newest"),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(25),
}).superRefine(({ startDate, endDate }, context) => {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end ||
    (end - start) / 86_400_000 > 365) {
    context.addIssue({ code: "custom", message: "Rentang maksimal 366 hari." });
  }
});

export const profitLossEntrySchema = z.object({
  date,
  direction,
  category: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(300),
  amount: z.coerce.number().finite().positive().max(999_999_999_999),
  reference: z.string().trim().max(120).optional().nullable(),
});

export const profitLossAdjustmentSchema = profitLossEntrySchema.extend({
  reason: z.string().trim().min(3).max(300),
});

export const profitLossVoidSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});

export type ProfitLossQuery = z.infer<typeof profitLossQuerySchema>;
