import { z } from "zod";

export const ownProfileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120),
}).strict();

export const ownPasswordUpdateSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  password: z.string().min(10).max(128),
  confirmPassword: z.string().min(10).max(128),
}).strict().superRefine((value, context) => {
  if (value.password !== value.confirmPassword) {
    context.addIssue({
      code: "custom",
      path: ["confirmPassword"],
      message: "Konfirmasi password tidak sama.",
    });
  }
  if (value.currentPassword === value.password) {
    context.addIssue({
      code: "custom",
      path: ["password"],
      message: "Password baru harus berbeda dari password saat ini.",
    });
  }
});
