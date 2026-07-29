import { z } from "zod";

const decimalText = z.union([
  z.number().finite().nonnegative(),
  z.string().trim().regex(/^\d+(\.\d{1,2})?$/),
]);

export const deliveryOperationalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const deliverySettlementListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
  operationalDate: z.union([deliveryOperationalDateSchema, z.literal("")]).optional().default(""),
  search: z.string().trim().max(100).optional().default(""),
  paymentStatus: z.enum(["", "UNCLEARED", "CLEAR", "OVERPAID"]).optional().default(""),
  paymentMethod: z.enum(["", "UNPAID", "CASH", "TRANSFER", "CASH_TRANSFER"]).optional().default(""),
});

export const deliveryAdjustmentSchema = z.object({
  requestKey: z.string().uuid(),
  status: z.enum(["BELUM_BAYAR", "SUDAH_BAYAR"]).default("SUDAH_BAYAR"),
  cashAmount: decimalText.default("0"),
  transfers: z.array(z.object({
    sequence: z.number().int().min(1).max(8),
    amount: decimalText,
  })).max(8).superRefine((items, context) => {
    const sequences = new Set(items.map((item) => item.sequence));
    if (sequences.size !== items.length) {
      context.addIssue({ code: "custom", message: "Sequence transfer harus unik." });
    }
  }),
  note: z.string().trim().max(500).nullable().optional(),
}).transform((value) =>
  value.status === "BELUM_BAYAR"
    ? { ...value, cashAmount: "0" as const, transfers: [] }
    : value,
);

export const dispatchRecordSchema = z.object({
  waybillNo: z.string().trim().min(1),
  kurir: z.string().default(""),
  ongkir: decimalText,
  waktu: z.string().default(""),
  receiver: z.string().default(""),
  address: z.string().default(""),
  status: z.string().default(""),
  berat: decimalText.default(0),
  pembayaran: z.string().default(""),
  service: z.string().default(""),
  codStatus: z.string().default(""),
  codValue: decimalText.default(0),
  barang: z.string().default(""),
});

export const codRecordSchema = z.object({
  waybillNo: z.string().trim().min(1),
  codAmount: decimalText,
  repaymentStatus: z.unknown(),
  repaymentType: z.unknown(),
  repaymentTypeCode: z.number().int().nullable().optional(),
  repaymentTypeLabel: z.string().nullable().optional(),
  signTime: z.string().default(""),
  dispatchStaffName: z.string().default(""),
});

export const sourceEnvelopeSchema = z.object({
  success: z.boolean().optional(),
  total: z.number().int().nonnegative(),
  data: z.array(z.unknown()),
});
