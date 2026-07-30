import { z } from "zod";

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
});

export const financeRangeSchema = z.object({
  startDate: calendarDate,
  endDate: calendarDate,
}).superRefine(({ startDate, endDate }, context) => {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (start > end || (end - start) / 86_400_000 > 30) {
    context.addIssue({ code: "custom", message: "Rentang tanggal tidak valid." });
  }
});

export const operationalDetailQuerySchema = financeRangeSchema.and(z.object({
  category: z.string().trim().max(100).optional().default(""),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(25),
}));
