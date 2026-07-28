import { z } from "zod";

export const pickupSettlementListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
  search: z.string().trim().max(100).optional().default(""),
  staff: z.string().trim().max(100).optional().default(""),
  paymentStatus: z.enum(["", "BELUM_BAYAR", "SUDAH_BAYAR", "LEBIH_BAYAR"]).optional().default(""),
  paymentMethod: z.enum(["", "TUNAI", "TRANSFER"]).optional().default(""),
});

export const pickupAdjustmentSchema = z.object({
  requestId: z.string().uuid(),
  discountAmount: z.union([
    z.number().finite().nonnegative(),
    z.string().regex(/^\d+(\.\d{1,2})?$/),
  ]),
  status: z.enum(["BELUM_BAYAR", "SUDAH_BAYAR"]),
  paymentMethod: z.enum(["TUNAI", "TRANSFER"]).nullable().optional(),
  transferAccountId: z.string().trim().max(100).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
}).superRefine((value, context) => {
  if (value.status === "BELUM_BAYAR") {
    if (value.transferAccountId) {
      context.addIssue({ code: "custom", path: ["transferAccountId"], message: "Rekening harus kosong." });
    }
    return;
  }
  if (!value.paymentMethod) {
    context.addIssue({ code: "custom", path: ["paymentMethod"], message: "Metode bayar wajib dipilih." });
  }
  if (value.paymentMethod === "TUNAI" && value.transferAccountId) {
    context.addIssue({ code: "custom", path: ["transferAccountId"], message: "Rekening harus kosong untuk tunai." });
  }
  if (value.paymentMethod === "TRANSFER" && !value.transferAccountId) {
    context.addIssue({ code: "custom", path: ["transferAccountId"], message: "Rekening transfer wajib dipilih." });
  }
});

export const pickupBulkAdjustmentSchema = z.object({
  batchRequestId: z.string().uuid(),
  masterPickupIds: z.array(z.string().uuid()).min(1).max(500)
    .refine((ids) => new Set(ids).size === ids.length, "ID pickup tidak boleh duplikat."),
  discountAmount: z.union([
    z.number().finite().nonnegative(),
    z.string().regex(/^\d+(\.\d{1,2})?$/),
  ]),
  status: z.enum(["BELUM_BAYAR", "SUDAH_BAYAR"]),
  paymentMethod: z.enum(["TUNAI", "TRANSFER"]).nullable().optional(),
  transferAccountId: z.string().trim().max(100).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
}).superRefine((value, context) => {
  if (value.status === "BELUM_BAYAR") {
    if (value.paymentMethod) {
      context.addIssue({ code: "custom", path: ["paymentMethod"], message: "Metode harus kosong." });
    }
    if (value.transferAccountId) {
      context.addIssue({ code: "custom", path: ["transferAccountId"], message: "Rekening harus kosong." });
    }
    return;
  }
  if (!value.paymentMethod) {
    context.addIssue({ code: "custom", path: ["paymentMethod"], message: "Metode bayar wajib dipilih." });
  }
  if (value.paymentMethod === "TUNAI" && value.transferAccountId) {
    context.addIssue({ code: "custom", path: ["transferAccountId"], message: "Rekening harus kosong untuk tunai." });
  }
  if (value.paymentMethod === "TRANSFER" && !value.transferAccountId) {
    context.addIssue({ code: "custom", path: ["transferAccountId"], message: "Rekening transfer wajib dipilih." });
  }
});
