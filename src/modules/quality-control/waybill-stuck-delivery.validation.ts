import { z } from "zod";

export const waybillStuckQuerySchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  waybill: z.string().trim().max(50).optional().default(""),
  customer: z.string().trim().max(100).optional().default(""),
  goodsName: z.string().trim().max(150).optional().default(""),
  currentScanSite: z.string().trim().max(100).optional().default(""),
  currentScanType: z.string().trim().max(100).optional().default(""),
  problem: z.string().trim().max(150).optional().default(""),
  void: z.enum(["", "true", "false"]).optional().default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(20),
});

export const waybillStuckSyncSchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
