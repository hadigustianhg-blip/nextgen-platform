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

const waybillDetailSchema = z.object({
  waybillNo: z.string(),
  customerName: z.string().catch(""),
  sender: z.object({ name: z.string().catch(""), city: z.string().catch("") }).strip(),
  receiver: z.object({
    name: z.string().catch(""),
    mobileMasked: z.string().catch(""),
    address: z.string().catch(""),
  }).strip(),
  goods: z.object({ name: z.string().catch(""), packageNumber: z.number().finite().catch(0) }).strip(),
  codMoney: z.number().finite().catch(0),
}).strip();

export type WaybillDetail = z.infer<typeof waybillDetailSchema>;
export type WaybillTrackingResult = z.infer<typeof trackingResponseSchema> & {
  detail: WaybillDetail | null;
  detailStatus: "AVAILABLE" | "NOT_FOUND" | "UNAVAILABLE";
};

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

function safeMaskedPhone(value: string) {
  return /[xX*•]/.test(value) && !/\d{7,}/.test(value) ? value : "";
}

export async function getRealtimeWaybillTracking(
  scope: { tenantId: string; outletId: string },
  waybillNo: string,
  execute = executeTrustedMultiOutletScraper,
): Promise<WaybillTrackingResult> {
  try {
    const [trackingOutcome, detailOutcome] = await Promise.allSettled([
      execute(scope, "WAYBILL_TRACKING", { waybillNo }),
      execute(scope, "WAYBILL_DETAIL", { waybillNo }),
    ]);
    if (trackingOutcome.status === "rejected") throw trackingOutcome.reason;
    const result = trackingResponseSchema.parse(trackingOutcome.value);
    let detail: WaybillDetail | null = null;
    let detailStatus: WaybillTrackingResult["detailStatus"] = "UNAVAILABLE";
    if (detailOutcome.status === "fulfilled") {
      const parsedDetail = waybillDetailSchema.safeParse(detailOutcome.value);
      if (parsedDetail.success) {
        detail = {
          ...parsedDetail.data,
          receiver: {
            ...parsedDetail.data.receiver,
            mobileMasked: safeMaskedPhone(parsedDetail.data.receiver.mobileMasked),
          },
        };
        detailStatus = "AVAILABLE";
      }
    } else if (detailOutcome.reason instanceof Error && detailOutcome.reason.message.includes("WAYBILL_DETAIL_NOT_FOUND")) {
      detailStatus = "NOT_FOUND";
    }
    return {
      ...result,
      detail,
      detailStatus,
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
