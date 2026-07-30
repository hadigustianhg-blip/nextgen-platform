import "server-only";
import { prisma } from "@/lib/db/prisma";
import { resolvePickupGroup } from "./pickup-scheduling.service";

const BASE_URL = "https://jfs-middleware-v2-production.up.railway.app";
const safeText = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;

export async function fetchPickupOrderDetail(orderId: string, fetcher: typeof fetch = fetch) {
  const url = new URL("/jfs-order-detail", process.env.JFS_MIDDLEWARE_URL || BASE_URL);
  url.searchParams.set("id", orderId);
  const response = await fetcher(url, {
    cache: "no-store", headers: { accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => null) as { success?: boolean; data?: Record<string, unknown> } | null;
  if (!response.ok || body?.success !== true || !body.data) throw new Error("DETAIL_FAILED");
  return {
    customerName: safeText(body.data.customerName),
    customerPhone: safeText(body.data.customerPhone),
    pickupAddress: safeText(body.data.pickupAddress),
    outletCode: safeText(body.data.outletCode),
  };
}

export async function getPickupSchedulingDetail(input: {
  tenantId: string; outletId: string; actorId: string;
  startDate: string; endDate: string;
  groupId: string; sessionOutletCode: string | null;
  fetchDetail?: typeof fetchPickupOrderDetail;
}) {
  const group = await resolvePickupGroup(input);
  if (!group?.representativeOrderId) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
  const detail = await (input.fetchDetail || fetchPickupOrderDetail)(group.representativeOrderId);
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId, outletId: input.outletId, actorId: input.actorId,
      action: "CREATE", entityType: "PICKUP_SCHEDULING_SENSITIVE_VIEW",
      entityId: group.groupId,
      metadata: {
        startDate: input.startDate, endDate: input.endDate,
        representativeWaybill: group.representativeWaybill,
        result: "SUCCESS",
      },
    },
  });
  return {
    groupId: group.groupId,
    customerName: detail.customerName,
    customerPhone: detail.customerPhone,
    pickupAddress: detail.pickupAddress,
    outletCode: detail.outletCode || group.outletCode || input.sessionOutletCode,
    orders: group.orders.map(({ waybill, source, goodsName }) => ({ waybill, source, goodsName })),
  };
}
