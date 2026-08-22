import { z } from "zod";
import { monitoringDetailMetrics } from "./monitoring-daily-detail";

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .or(z.literal("").transform(() => undefined));

const page = z.coerce.number().int().min(1).default(1);
const pageSize = z.coerce.number().int().min(5).max(100).default(10);

export const monitoringDailyQuerySchema = z.object({
  businessDate: optionalDate,
  outletId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  deliveryPage: page,
  pickupPage: page,
  pageSize,
});

export const monitoringDailyDiagnosticSchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  outletId: z.string().uuid().optional(),
  waybill: z.string().trim().min(1).max(50).optional(),
});

export const monitoringDailyDetailQuerySchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  outletId: z.string().uuid().optional(),
  metric: z.enum(monitoringDetailMetrics),
  team: z.string().trim().min(1).max(200).optional(),
});

export type MonitoringDailyQuery = z.infer<typeof monitoringDailyQuerySchema>;
