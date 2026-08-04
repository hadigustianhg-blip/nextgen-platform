import { z } from "zod";

export const leaveTypes = ["LEAVE", "PERMISSION", "SICK"] as const;
export const leaveStatuses = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;

export const leaveCreateSchema = z.object({
  type: z.enum(leaveTypes),
  startDate: z.string().date(),
  endDate: z.string().date(),
  reason: z.string().trim().min(5).max(1000),
}).strict().refine((value) => value.endDate >= value.startDate, {
  message: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
  path: ["endDate"],
});

export const teamLeaveQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(leaveStatuses).optional(),
});

export const adminLeaveQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  search: z.string().trim().max(120).optional(),
  type: z.enum(leaveTypes).optional(),
  status: z.enum(leaveStatuses).optional(),
}).refine((value) => !value.startDate || !value.endDate || value.endDate >= value.startDate, {
  message: "Rentang tanggal tidak valid.",
  path: ["endDate"],
});

export const leaveApproveSchema = z.object({
  reviewNotes: z.string().trim().max(1000).optional(),
}).strict();

export const leaveRejectSchema = z.object({
  reviewNotes: z.string().trim().min(5).max(1000),
}).strict();
