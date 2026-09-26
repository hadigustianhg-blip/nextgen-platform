import { z } from "zod";
import { isValidSlaCycle } from "./sla-cut-off.calculation";

const cycleFields = {
  outletId: z.string().uuid(),
  periodStart: z.string(),
  periodEnd: z.string(),
};
const validateCycle = (value: { periodStart: string; periodEnd: string }, context: z.RefinementCtx) => {
  if (!isValidSlaCycle(value.periodStart, value.periodEnd)) {
    context.addIssue({ code: "custom", message: "Periode harus mengikuti siklus tanggal 21–20." });
  }
};
export const slaCutOffQuerySchema = z.object(cycleFields).superRefine(validateCycle);
export const slaCutOffSyncSchema = z.object({
  ...cycleFields,
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).superRefine((value, context) => {
  validateCycle(value, context);
  if (value.businessDate < value.periodStart || value.businessDate > value.periodEnd) {
    context.addIssue({ code: "custom", path: ["businessDate"], message: "Tanggal sinkronisasi harus berada dalam periode." });
  }
});
