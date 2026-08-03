import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
export const businessProfileSchema = z.object({
  tenant: z.object({ name: z.string().trim().min(2).max(120), address: optionalText(500), phone: optionalText(40), email: z.string().trim().email().max(160).nullable().optional(), timezone: z.string().trim().min(3).max(80) }),
  outlet: z.object({ name: z.string().trim().min(2).max(120), code: z.string().trim().min(2).max(40), address: optionalText(500), phone: optionalText(40), email: z.string().trim().email().max(160).nullable().optional(), adminWhatsapp: optionalText(40), isActive: z.boolean() }),
});
export const userUpdateSchema = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(160), roleCode: z.string().trim().min(2).max(40), status: z.enum(["ACTIVE", "SUSPENDED"]) });
export const resetPasswordSchema = z.object({ password: z.string().min(10).max(128) });
export const bankAccountSchema = z.object({ bankName: z.string().trim().min(2).max(100), accountNumber: z.string().trim().min(3).max(60), accountHolder: z.string().trim().min(2).max(120), displayOrder: z.coerce.number().int().min(0).max(999).default(0), isActive: z.boolean().default(true), isDefault: z.boolean().default(false) });
export const financialCategorySchema = z.object({ name: z.string().trim().min(2).max(120), type: z.enum(["INCOME", "EXPENSE"]), isActive: z.boolean().default(true), sortOrder: z.coerce.number().int().min(0).max(999).default(0) });
export const auditLogQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25), actorId: z.string().uuid().optional(), entityType: z.string().trim().max(80).optional(), action: z.enum(["LOGIN", "LOGOUT", "CREATE", "UPDATE", "DELETE"]).optional(), startDate: z.string().date().optional(), endDate: z.string().date().optional() });
