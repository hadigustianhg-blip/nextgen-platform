import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const positiveInteger = z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]);

export const pickupPaymentListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
  pickupDate: z.union([date, z.literal("")]).default(""),
  waybill: z.string().trim().max(100).default(""),
  customer: z.string().trim().max(100).default(""),
  staff: z.string().trim().max(100).default(""),
  status: z.union([z.enum(["BELUM_BAYAR", "SEBAGIAN", "LUNAS", "LEBIH_BAYAR"]), z.literal("")]).default(""),
  age: z.union([z.enum(["TODAY", "1_3", "4_7", "OVER_7", "OVER_30"]), z.literal("")]).default(""),
  method: z.union([z.enum(["CASH", "TRANSFER"]), z.literal("")]).default(""),
  search: z.string().trim().max(100).default(""),
});

const pickupPaymentFields = z.object({
  requestKey: z.string().uuid(),
  paymentDate: date,
  method: z.enum(["CASH", "TRANSFER"]),
  amount: positiveInteger,
  reference: z.string().trim().max(100).optional().default(""),
  bank: z.string().trim().max(100).optional().default(""),
  note: z.string().trim().max(500).optional().default(""),
  confirmOverpayment: z.boolean().optional().default(false),
});

const requireTransferBank = <T extends z.ZodType>(schema: T) => schema.superRefine((value, context) => {
  const payment = value as { method: "CASH" | "TRANSFER"; bank?: string };
  if (payment.method === "TRANSFER" && !payment.bank) {
    context.addIssue({ code: "custom", path: ["bank"], message: "Bank wajib diisi." });
  }
});

export const pickupPaymentInputSchema = requireTransferBank(pickupPaymentFields.extend({
  masterPickupId: z.string().uuid(),
}));

export const pickupPaymentUpdateSchema = requireTransferBank(pickupPaymentFields);

export const pickupPaymentVoidSchema = z.object({
  requestKey: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
});

export const pickupPaymentBulkAdjustmentSchema = requireTransferBank(z.object({
  batchRequestId: z.string().uuid(),
  masterPickupIds: z.array(z.string().uuid()).min(1).max(500)
    .refine((ids) => new Set(ids).size === ids.length, "ID pickup tidak boleh duplikat."),
  paymentDate: date,
  method: z.enum(["CASH", "TRANSFER"]),
  reference: z.string().trim().max(100).optional().default(""),
  bank: z.string().trim().max(100).optional().default(""),
  note: z.string().trim().max(500).optional().default(""),
}).strict());
