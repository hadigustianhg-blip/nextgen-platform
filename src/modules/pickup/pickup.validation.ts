import { z } from "zod";

const decimalSource = z.union([z.number().finite(), z.string().regex(/^-?\d+(\.\d+)?$/)]);

export const pickupRecordSchema = z.object({
  waybillNo: z.string().trim().min(1),
  pickNetwork: z.string(),
  destination: z.string(),
  settlement: z.string(),
  totalFreight: decimalSource,
  freight: decimalSource,
  weight: decimalSource,
  staff: z.string(),
  sender: z.string(),
  service: z.string(),
  receiver: z.string(),
  address: z.string(),
});

export const pickupEnvelopeSchema = z.object({
  total: z.number().int().nonnegative(),
  data: z.array(z.unknown()),
});

export const operationalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const pickupListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
  search: z.string().trim().max(100).optional().default(""),
  staff: z.string().trim().max(100).optional().default(""),
  destination: z.string().trim().max(100).optional().default(""),
  settlement: z.string().trim().max(100).optional().default(""),
});
