import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
export const businessProfileSchema = z.object({
  tenant: z.object({ name: z.string().trim().min(2).max(120), address: optionalText(500), phone: optionalText(40), email: z.string().trim().email().max(160).nullable().optional(), timezone: z.string().trim().min(3).max(80) }),
  outlet: z.object({ name: z.string().trim().min(2).max(120), code: z.string().trim().min(2).max(40), address: optionalText(500), phone: optionalText(40), email: z.string().trim().email().max(160).nullable().optional(), adminWhatsapp: optionalText(40), isActive: z.boolean() }),
});
const userTypeSchema = z.enum(["ADMIN_WEB", "TEAM_PWA"]);
const userIdentityFields = {
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  userType: userTypeSchema,
  roleCode: z.string().trim().min(2).max(40).nullable().optional(),
  salaryEmployeeId: z.string().uuid().nullable().optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]),
};
const validateUserIdentity = (value: { userType: "ADMIN_WEB" | "TEAM_PWA"; roleCode?: string | null; salaryEmployeeId?: string | null }, context: z.RefinementCtx) => {
  if (value.userType === "TEAM_PWA" && !value.salaryEmployeeId) context.addIssue({ code: "custom", path: ["salaryEmployeeId"], message: "SalaryEmployee wajib dipilih." });
  if (value.userType === "ADMIN_WEB" && !value.roleCode) context.addIssue({ code: "custom", path: ["roleCode"], message: "Role wajib dipilih." });
};
export const userCreateSchema = z.object({
  ...userIdentityFields,
  password: z.string().min(10).max(128),
  confirmPassword: z.string().min(10).max(128),
}).superRefine((value, context) => {
  validateUserIdentity(value, context);
  if (value.password !== value.confirmPassword) context.addIssue({ code: "custom", path: ["confirmPassword"], message: "Konfirmasi password tidak sama." });
});
export const userUpdateSchema = z.object(userIdentityFields).superRefine(validateUserIdentity);
export const resetPasswordSchema = z.object({ password: z.string().min(10).max(128) });
export const bankAccountSchema = z.object({ bankName: z.string().trim().min(2).max(100), accountNumber: z.string().trim().min(3).max(60), accountHolder: z.string().trim().min(2).max(120), displayOrder: z.coerce.number().int().min(0).max(999).default(0), isActive: z.boolean().default(true), isDefault: z.boolean().default(false) });
export const financialCategorySchema = z.object({ name: z.string().trim().min(2).max(120), type: z.enum(["INCOME", "EXPENSE"]), isActive: z.boolean().default(true), sortOrder: z.coerce.number().int().min(0).max(999).default(0) });
export const auditLogQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25), actorId: z.string().uuid().optional(), entityType: z.string().trim().max(80).optional(), action: z.enum(["LOGIN", "LOGOUT", "CREATE", "UPDATE", "DELETE"]).optional(), startDate: z.string().date().optional(), endDate: z.string().date().optional() });
