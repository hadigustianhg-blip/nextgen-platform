import { z } from "zod";

export const paymentSettlementQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2100),
  outletId: z.string().uuid().optional().default(""),
  closingStatus: z.union([
    z.enum(["BELUM_CLOSING", "OPEN", "REOPENED", "CLOSED"]),
    z.literal(""),
  ]).optional().default(""),
});

export const businessDateParamSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

