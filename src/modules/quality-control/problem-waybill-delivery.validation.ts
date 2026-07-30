import { z } from "zod";

export const problemWaybillQuerySchema = z.object({
  businessDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional().default(""),
  waybill: z.string().trim().max(50).optional().default(""),
  courierName: z.string().trim().max(100).optional().default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(20),
  sortBy: z.enum(["businessDate", "waybill", "courierName", "lastUpdatedAt"]).default("businessDate"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const problemWaybillParamSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{6,50}$/);
