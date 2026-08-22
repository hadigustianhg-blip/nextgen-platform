import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { executeTrustedMultiOutletScraper } from "@/modules/integrations/jfs-multi-outlet-client";
import type { SettingsScope } from "@/modules/settings/settings.types";
import { resolvePickupGroup } from "./pickup-scheduling.service";
import { normalizePickupPhone } from "./pickup-scheduling-whatsapp";
import { PICKUP_SCHEDULING_PROVIDER } from "./pickup-scheduling.constants";

const safeText = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;

export type PickupSenderDetail = {
  externalJfsId: string; waybill: string; senderName: string | null;
  senderMobilePhone: string; senderCityName: string | null;
};

export class PickupSenderDetailError extends Error {
  constructor(public readonly code: string, public readonly status = 502) { super(code); }
}

export async function fetchPickupSenderDetail(
  externalJfsId: string,
  scope: SettingsScope,
  execute: typeof executeTrustedMultiOutletScraper = executeTrustedMultiOutletScraper,
): Promise<PickupSenderDetail> {
  try {
    const data = await execute(scope, "OMS_SCHEDULING_DETAIL", { externalJfsId }) as Record<string, unknown>;
    const returnedId = safeText(data.id);
    const waybill = safeText(data.waybillId);
    const phone = safeText(data.senderMobilePhone);
    if (!returnedId || !waybill || !phone) throw new PickupSenderDetailError("DETAIL_JFS_INVALID");
    return { externalJfsId: returnedId, waybill, senderName: safeText(data.senderName),
      senderMobilePhone: phone, senderCityName: safeText(data.senderCityName) };
  } catch (error) {
    if (error instanceof PickupSenderDetailError) throw error;
    throw new PickupSenderDetailError("DETAIL_JFS_UNAVAILABLE");
  }
}

export async function getPickupSchedulingDetail(input: {
  tenantId: string; outletId: string; actorId: string; startDate: string; endDate: string;
  groupId: string; sessionOutletCode: string | null; requestId?: string;
  fetchDetail?: typeof fetchPickupSenderDetail;
}) {
  const group = await resolvePickupGroup(input);
  if (!group) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
  if (group.sourceProvider !== PICKUP_SCHEDULING_PROVIDER) {
    throw new PickupSenderDetailError("INVALID_PICKUP_SCHEDULING_SOURCE", 403);
  }
  if (!group.externalJfsId) throw new PickupSenderDetailError("EXTERNAL_JFS_ID_UNAVAILABLE");
  const requestId = input.requestId || randomUUID();
  const fetchDetail = input.fetchDetail || fetchPickupSenderDetail;
  const expectedWaybill = group.representativeWaybill.trim();
  let detail: PickupSenderDetail;
  try {
    detail = await fetchDetail(group.externalJfsId, { tenantId: input.tenantId, outletId: input.outletId });
    if (detail.externalJfsId !== group.externalJfsId || detail.waybill.trim() !== expectedWaybill) {
      console.warn("PICKUP_SCHEDULING_DETAIL_MISMATCH", {
        requestId, recordId: group.recordId, waybill: expectedWaybill, errorCode: "DETAIL_IDENTITY_MISMATCH",
      });
      throw new PickupSenderDetailError("DETAIL_IDENTITY_MISMATCH");
    }
    if (!normalizePickupPhone(detail.senderMobilePhone)) throw new PickupSenderDetailError("PHONE_INVALID");
  } catch (error) {
    if (!(error instanceof PickupSenderDetailError && error.code === "DETAIL_IDENTITY_MISMATCH")) {
      console.warn("PICKUP_SCHEDULING_DETAIL_FAILED", {
        requestId, recordId: group.recordId, waybill: expectedWaybill,
        errorCode: error instanceof PickupSenderDetailError ? error.code : "DETAIL_JFS_UNAVAILABLE",
      });
    }
    throw error;
  }

  await prisma.auditLog.create({ data: {
    tenantId: input.tenantId, outletId: input.outletId, actorId: input.actorId,
    action: "CREATE", entityType: "PICKUP_SCHEDULING_SENSITIVE_VIEW", entityId: group.recordId,
    metadata: { requestId, event: "WA_CONFIRMATION_OPENED", recordId: group.recordId, waybill: expectedWaybill },
  } });

  return {
    requestId, groupId: group.groupId, senderName: detail.senderName || group.sellerName,
    senderMobilePhone: detail.senderMobilePhone, senderCityName: detail.senderCityName,
    outletCode: group.outletCode || input.sessionOutletCode,
    details: [{ waybill: detail.waybill, senderName: detail.senderName,
      senderMobilePhone: detail.senderMobilePhone, senderCityName: detail.senderCityName,
      status: "success" as const, errorCode: null }],
    orders: group.orders.map(({ waybill, source, goodsName }) => ({ waybill, source, goodsName })),
  };
}
