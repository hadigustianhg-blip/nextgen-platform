import { z } from "zod";
import { isValidSlaCycle } from "./sla-cut-off.calculation";

const cycle = z.object({
  outletId: z.string().uuid(),
  periodStart: z.string(),
  periodEnd: z.string(),
}).superRefine((value, context) => {
  if (!isValidSlaCycle(value.periodStart, value.periodEnd)) {
    context.addIssue({ code: "custom", message: "Periode harus mengikuti siklus tanggal 21–20." });
  }
});
export const slaCutOffQuerySchema = cycle;
export const slaCutOffSyncSchema = cycle;
