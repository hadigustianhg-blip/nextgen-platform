import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const pickupSchedulingQuerySchema = z.object({
  businessDate: date,
  waybill: z.string().trim().max(100).default(""),
  sender: z.string().trim().max(100).default(""),
  source: z.string().trim().max(100).default(""),
});
export const pickupSchedulingSyncSchema = z.object({ businessDate: date });
