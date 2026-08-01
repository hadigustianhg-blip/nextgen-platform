import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { resolvePickupGroup } from "./pickup-scheduling.service";
import { normalizePickupPhone } from "./pickup-scheduling-whatsapp";

const safeText = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const TRANSIENT_STATUSES = new Set([502, 503, 504]);

type SenderDetailBody = {
  success?: boolean;
  data?: {
    senderName?: unknown;
    senderMobilePhone?: unknown;
    senderCityName?: unknown;
  } | null;
  error?: { code?: unknown };
};

export type PickupSenderDetail = {
  waybill: string;
  senderName: string | null;
  senderMobilePhone: string | null;
  senderCityName: string | null;
};

export class PickupSenderDetailError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly contentType: string,
    public readonly responseKeys: string[],
  ) {
    super(code);
  }
}

function middlewareBaseUrl() {
  const value = process.env.JFS_MIDDLEWARE_BASE_URL?.trim();
  if (!value) throw new PickupSenderDetailError("MIDDLEWARE_NOT_CONFIGURED", 500, "", []);
  return value;
}

function isTransient(error: unknown) {
  return error instanceof PickupSenderDetailError
    ? TRANSIENT_STATUSES.has(error.status)
    : error instanceof DOMException && error.name === "TimeoutError";
}

export async function fetchPickupSenderDetail(
  waybill: string,
  fetcher: typeof fetch = fetch,
): Promise<PickupSenderDetail> {
  const canonicalWaybill = waybill.trim();
  const url = new URL("/jfs-sender-detail", middlewareBaseUrl());
  url.searchParams.set("waybillNo", canonicalWaybill);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetcher(url, {
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      const contentType = response.headers.get("content-type") || "";
      const body = contentType.toLowerCase().includes("application/json")
        ? await response.json().catch(() => null) as SenderDetailBody | null
        : null;
      const responseKeys = body && typeof body === "object" ? Object.keys(body) : [];

      if (!response.ok || body?.success !== true || !body.data) {
        const code = safeText(body?.error?.code)
          || (response.status === 404 ? "SENDER_DETAIL_NOT_FOUND" : "SENDER_DETAIL_FAILED");
        throw new PickupSenderDetailError(code, response.status, contentType, responseKeys);
      }

      return {
        waybill: canonicalWaybill,
        senderName: safeText(body.data.senderName),
        senderMobilePhone: safeText(body.data.senderMobilePhone),
        senderCityName: safeText(body.data.senderCityName),
      };
    } catch (error) {
      if (attempt === 0 && isTransient(error)) continue;
      if (error instanceof PickupSenderDetailError) throw error;
      throw new PickupSenderDetailError(
        error instanceof DOMException && error.name === "TimeoutError" ? "SENDER_DETAIL_TIMEOUT" : "SENDER_DETAIL_FAILED",
        error instanceof DOMException && error.name === "TimeoutError" ? 504 : 502,
        "",
        [],
      );
    }
  }
  throw new PickupSenderDetailError("SENDER_DETAIL_FAILED", 502, "", []);
}

function maskWaybill(waybill: string) {
  return waybill.length <= 4 ? waybill : `${"*".repeat(Math.min(8, waybill.length - 4))}${waybill.slice(-4)}`;
}

export async function getPickupSchedulingDetail(input: {
  tenantId: string; outletId: string; actorId: string;
  startDate: string; endDate: string;
  groupId: string; sessionOutletCode: string | null;
  requestId?: string;
  fetchDetail?: typeof fetchPickupSenderDetail;
}) {
  const group = await resolvePickupGroup(input);
  if (!group) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
  const requestId = input.requestId || randomUUID();
  const fetchDetail = input.fetchDetail || fetchPickupSenderDetail;
  const uniqueWaybills = [...new Set(group.orders.map((order) => order.waybill.trim()).filter(Boolean))];

  const details = await Promise.all(uniqueWaybills.map(async (waybill) => {
    const startedAt = Date.now();
    try {
      const detail = await fetchDetail(waybill);
      return { ...detail, status: "success" as const, errorCode: null };
    } catch (error) {
      const failure = error instanceof PickupSenderDetailError ? error : null;
      console.warn("PICKUP_SCHEDULING_SENDER_DETAIL_FAILED", {
        requestId,
        waybill: maskWaybill(waybill),
        stage: "FETCH_SENDER_DETAIL",
        httpStatus: failure?.status || 502,
        responseContentType: failure?.contentType || null,
        responseKeys: failure?.responseKeys || [],
        errorCode: failure?.code || "SENDER_DETAIL_FAILED",
        durationMs: Date.now() - startedAt,
      });
      return {
        waybill,
        senderName: null,
        senderMobilePhone: null,
        senderCityName: null,
        status: "failed" as const,
        errorCode: failure?.code || "SENDER_DETAIL_FAILED",
      };
    }
  }));

  const successful = details.find((detail) => detail.status === "success");
  const detailWithValidPhone = details.find((detail) =>
    detail.status === "success" && normalizePickupPhone(detail.senderMobilePhone));
  const listPhone = normalizePickupPhone(group.senderPhoneMasked) ? group.senderPhoneMasked : null;
  const senderMobilePhone = detailWithValidPhone?.senderMobilePhone || listPhone;

  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId, outletId: input.outletId, actorId: input.actorId,
      action: "CREATE", entityType: "PICKUP_SCHEDULING_SENSITIVE_VIEW",
      entityId: group.groupId,
      metadata: {
        requestId, startDate: input.startDate, endDate: input.endDate,
        representativeWaybill: group.representativeWaybill,
        requested: uniqueWaybills.length,
        succeeded: details.filter((detail) => detail.status === "success").length,
        failed: details.filter((detail) => detail.status === "failed").length,
        result: successful ? "SUCCESS" : "FAILED",
      },
    },
  });

  return {
    requestId,
    groupId: group.groupId,
    senderName: successful?.senderName || group.sellerName,
    senderMobilePhone,
    senderCityName: successful?.senderCityName || null,
    outletCode: group.outletCode || input.sessionOutletCode,
    details,
    orders: group.orders.map(({ waybill, source, goodsName }) => ({ waybill, source, goodsName })),
  };
}
