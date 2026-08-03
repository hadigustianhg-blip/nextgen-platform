import { z } from "zod";
import { jakartaCurrentMonthRange } from "@/lib/dates/jakarta-date";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const DAY = 86_400_000;

export const dashboardOverviewQuerySchema = z.object({
  startDate: date.optional(),
  endDate: date.optional(),
}).transform((value) => {
  const fallback = jakartaCurrentMonthRange();
  return {
    startDate: value.startDate ?? fallback.startDate,
    endDate: value.endDate ?? fallback.endDate,
  };
}).superRefine((value, context) => {
  const start = new Date(`${value.startDate}T00:00:00.000Z`);
  const end = new Date(`${value.endDate}T00:00:00.000Z`);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || value.startDate > value.endDate) {
    context.addIssue({ code: "custom", path: ["endDate"], message: "Rentang tanggal tidak valid." });
    return;
  }
  if ((end.valueOf() - start.valueOf()) / DAY + 1 > 366) {
    context.addIssue({ code: "custom", path: ["endDate"], message: "Periode maksimum 366 hari." });
  }
});

export type DashboardOverviewQuery = z.infer<typeof dashboardOverviewQuerySchema>;
