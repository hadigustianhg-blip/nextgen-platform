import { z } from "zod";
import { executeTrustedMultiOutletScraper } from "@/modules/integrations/jfs-multi-outlet-client";

export const waybillTrackingRequestSchema = z.object({
  waybillNo: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9]+$/),
}).strict();

const nullableCode = z.union([z.string(), z.number(), z.null()]);
const trackingEventSchema = z.object({
  scanTime: z.string().catch(""),
  uploadTime: z.string().catch(""),
  scanTypeName: z.string().catch(""),
  scanNetworkName: z.string().catch(""),
  scanNetworkCode: z.string().catch(""),
  nextStopName: z.string().catch(""),
  nextNetworkCode: z.string().catch(""),
  status: z.string().catch(""),
  code: nullableCode.catch(null),
  scanMode: z.string().catch(""),
  taskCode: z.string().catch(""),
  description: z.string().catch(""),
}).strip();

const trackingResponseSchema = z.object({
  waybillNo: z.string(),
  latest: trackingEventSchema.omit({ description: true }),
  timeline: z.array(trackingEventSchema),
}).strip();

export type WaybillTrackingResult = z.infer<typeof trackingResponseSchema>;

export class WaybillTrackingServiceError extends Error {
  constructor(
    readonly code: "WAYBILL_TRACKING_NOT_FOUND" | "TRACKING_UNAVAILABLE",
    readonly status: 404 | 502,
  ) {
    super(code);
  }
}

function removePhoneNumbers(value: string) {
  return value
    .replace(/\(\s*\+?\d[\d\s-]{6,}\s*\)/g, "")
    .replace(/\+?\d[\d\s-]{6,}\d/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export async function getRealtimeWaybillTracking(
  scope: { tenantId: string; outletId: string },
  waybillNo: string,
  execute = executeTrustedMultiOutletScraper,
): Promise<WaybillTrackingResult> {
  try {
    const payload = await execute(scope, "WAYBILL_TRACKING", { waybillNo });
    const result = trackingResponseSchema.parse(payload);
    return {
      ...result,
      timeline: result.timeline.map((event) => ({
        ...event,
        description: removePhoneNumbers(event.description),
      })),
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("WAYBILL_TRACKING_NOT_FOUND")) {
      throw new WaybillTrackingServiceError("WAYBILL_TRACKING_NOT_FOUND", 404);
    }
    throw new WaybillTrackingServiceError("TRACKING_UNAVAILABLE", 502);
  }
}
