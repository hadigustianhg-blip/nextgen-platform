import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const monitoringMonthlyQuerySchema = z
  .object({
    startDate: date,
    endDate: date,
    outletId: z.string().uuid(),
    deliveryPage: z.coerce.number().int().min(1).default(1),
    pickupPage: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(5).max(100).default(25),
  })
  .superRefine((value, context) => {
    if (value.startDate > value.endDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Tanggal selesai harus setelah tanggal mulai.",
      });
    }
    if (value.startDate.slice(0, 7) !== value.endDate.slice(0, 7)) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Rentang Monitoring Monthly harus dalam bulan yang sama.",
      });
    }
  });

export type MonitoringMonthlyQuery = z.infer<
  typeof monitoringMonthlyQuerySchema
>;
