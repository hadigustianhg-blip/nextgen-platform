import { z } from "zod";

export const loginSchema = z.object({
  tenant: z.string().trim().min(2, "Tenant wajib diisi").max(80),
  email: z.email("Email tidak valid"),
  password: z.string().min(8, "Password minimal 8 karakter").max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;
