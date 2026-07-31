import { z } from "zod";

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}, "Tanggal tidak valid.");

export const invoiceRangeSchema = z.object({
  startDate: calendarDate,
  endDate: calendarDate,
  seller: z.string().trim().max(150).optional().default(""),
  waybill: z.string().trim().max(100).optional().default(""),
  customerKey: z.string().trim().max(250).optional().default(""),
  invoiceId: z.string().uuid().optional(),
}).superRefine(({ startDate, endDate }, context) => {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (start > end || (end - start) / 86_400_000 > 30) {
    context.addIssue({ code: "custom", message: "Rentang tanggal tidak valid." });
  }
});

export const invoiceListSchema = z.object({
  search: z.string().trim().max(150).optional().default(""),
  status: z.enum([
    "DRAFT", "ISSUED", "SENT", "PARTIALLY_PAID", "PAID", "CANCELLED", "VOID",
  ]).or(z.literal("")).optional().default(""),
  startDate: calendarDate.optional(),
  endDate: calendarDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
});

export const invoiceDraftSchema = z.object({
  customerKey: z.string().trim().min(1).max(250),
  customerName: z.string().trim().min(1).max(200),
  companyName: z.string().trim().max(200).nullable().optional(),
  whatsapp: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional().or(z.literal("")),
  address: z.string().trim().max(500).nullable().optional(),
  recipientName: z.string().trim().max(200).nullable().optional(),
  recipientPhone: z.string().trim().max(30).nullable().optional(),
  recipientCity: z.string().trim().max(200).nullable().optional(),
  bankAccountId: z.string().uuid().nullable().optional(),
  invoiceDate: calendarDate,
  dueDate: calendarDate,
  periodStart: calendarDate,
  periodEnd: calendarDate,
  notes: z.string().trim().max(1000).nullable().optional(),
  itemIds: z.array(z.string().uuid()).min(1).max(500),
}).superRefine(({ invoiceDate, dueDate, periodStart, periodEnd }, context) => {
  if (invoiceDate > dueDate || periodStart > periodEnd) {
    context.addIssue({ code: "custom", message: "Tanggal invoice tidak valid." });
  }
});

export const invoiceWhatsappSchema = z.object({
  confirmation: z.literal(true),
});

export const invoiceVoidSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const outletBankAccountSchema = z.object({
  bankName: z.string().trim().min(1).max(100),
  accountNumber: z.string().trim().min(1).max(100)
    .transform((value) => value.replace(/\s+/g, "")),
  accountHolder: z.string().trim().min(1).max(200),
  isDefault: z.boolean().optional().default(false),
});
