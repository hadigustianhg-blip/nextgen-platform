import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const requestKey = z.string().uuid();
const positiveInteger = z.union([
  z.number().int().positive(),
  z.string().regex(/^[1-9]\d*$/),
]);

export const cashFlowListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
  startDate: z.union([date, z.literal("")]).default(""),
  endDate: z.union([date, z.literal("")]).default(""),
  direction: z.union([z.enum(["IN", "OUT"]), z.literal("")]).default(""),
  channel: z.union([z.enum(["CASH", "BANK"]), z.literal("")]).default(""),
  movementType: z.union([z.enum([
    "PICKUP_PAYMENT", "DELIVERY_PAYMENT", "BANK_DEPOSIT", "OPERATIONAL_EXPENSE",
    "CASH_WITHDRAWAL", "MANUAL_INCOME", "MANUAL_EXPENSE", "REFUND", "ADJUSTMENT", "TRANSFER",
  ]), z.literal("")]).default(""),
  reference: z.string().trim().max(100).default(""),
  search: z.string().trim().max(100).default(""),
});

const manualBase = z.object({
  requestKey,
  businessDate: date,
  occurredAt: z.string().datetime(),
  channel: z.enum(["CASH", "BANK"]),
  amount: positiveInteger,
  reference: z.string().trim().max(100).optional().default(""),
  source: z.string().trim().max(100).optional().default(""),
  description: z.string().trim().max(500).optional().default(""),
});

export const manualIncomeSchema = manualBase.extend({
  category: z.enum([
    "Refund Pembelian", "Pengembalian Kasbon", "Tambahan Modal",
    "Pendapatan Lain", "Koreksi Kas Masuk", "Lainnya",
  ]),
});

export const manualExpenseSchema = manualBase.extend({
  category: z.enum([
    "Tarik Cash Owner", "Pindah Kas", "Pengeluaran Lain",
    "Koreksi Kas Keluar", "Lainnya",
  ]),
  recipient: z.string().trim().max(100).optional().default(""),
});

export const updateManualMovementSchema = z.object({
  requestKey,
  businessDate: date,
  occurredAt: z.string().datetime(),
  channel: z.enum(["CASH", "BANK"]),
  amount: positiveInteger,
  category: z.string().trim().min(1).max(100),
  reference: z.string().trim().max(100).optional().default(""),
  source: z.string().trim().max(100).optional().default(""),
  description: z.string().trim().max(500).optional().default(""),
});

export const voidCashMovementSchema = z.object({
  requestKey,
  reason: z.string().trim().min(1).max(500),
});

