import { z } from "zod";

const isCalendarDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return parsed.getUTCFullYear() === Number(match[1])
    && parsed.getUTCMonth() === Number(match[2]) - 1
    && parsed.getUTCDate() === Number(match[3]);
};
const date = z.string().refine(isCalendarDate, "INVALID_DATE");
const dateRange = z.object({ startDate: date, endDate: date }).superRefine(
  ({ startDate, endDate }, context) => {
    const start = Date.parse(`${startDate}T00:00:00.000Z`);
    const end = Date.parse(`${endDate}T00:00:00.000Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
      context.addIssue({ code: "custom", message: "INVALID_DATE_RANGE" });
    } else if ((end - start) / 86_400_000 > 30) {
      context.addIssue({ code: "custom", message: "DATE_RANGE_TOO_LARGE" });
    }
  },
);
export const pickupSchedulingQuerySchema = z.object({
  startDate: date,
  endDate: date,
  sourceProvider: z.string().trim().max(100).default(""),
  orderStatus: z.string().trim().max(100).default(""),
  sendName: z.string().trim().max(100).default(""),
  pickupStaff: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).and(dateRange);
export const pickupSchedulingSyncSchema = dateRange;
