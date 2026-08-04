import { z } from "zod";

export const MAX_LOCATION_ACCURACY_METERS = 100;

export const attendanceLocationInputSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().min(0).max(10_000),
  capturedAt: z.string().datetime({ offset: true }).optional(),
  idempotencyKey: z.string().trim().min(8).max(100),
}).strict();

export const attendanceHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
});

export const attendanceLocationSettingSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  radiusMeters: z.number().int().min(1).max(10_000),
  isActive: z.boolean(),
}).strict();

export const attendanceMonitoringQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  businessDate: z.string().date().optional(),
  search: z.string().trim().max(120).optional(),
  status: z.enum(["PRESENT", "LATE", "ABSENT", "LEAVE", "SICK", "PERMISSION"]).optional(),
});

export const attendanceCorrectionSchema = z.object({
  checkInAt: z.string().datetime({ offset: true }).nullable().optional(),
  checkOutAt: z.string().datetime({ offset: true }).nullable().optional(),
  status: z.enum(["PRESENT", "LATE", "ABSENT", "LEAVE", "SICK", "PERMISSION"]).optional(),
  reason: z.string().trim().min(10).max(500),
}).strict().refine(
  (value) => value.checkInAt !== undefined || value.checkOutAt !== undefined || value.status !== undefined,
  { message: "Minimal satu nilai koreksi wajib diisi." },
);
