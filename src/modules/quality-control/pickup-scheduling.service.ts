import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { jakartaOperationalDate } from "@/lib/dates/jakarta-date";
import { PICKUP_SCHEDULING_PROVIDER } from "./pickup-scheduling.constants";

export type PickupScheduleRow = {
  id: string; businessDate: Date; sourceOrderId: string; externalJfsId: string | null;
  waybillNo: string; customerId: string | null; customerName: string | null;
  senderNameMasked: string | null; senderPhoneMasked: string | null;
  pickupAddressMasked: string | null; senderCompany: string | null;
  senderCityName: string | null; senderAreaName: string | null;
  sourcePlatform: string | null; goodsName: string | null; weight: unknown;
  sourceStatus: string | null; orderStatusCode: number | null;
  sourceOutletCode: string | null; sourceNetworkCode: string | null;
  pickNetworkName: string | null; pickStaffName: string | null; pickStaffCode: string | null;
  sendName: string | null; pickFailReason: string | null; pickFailAt: Date | null;
  pickFailTimes: number | null; sourceInputAt: Date | null; sourceUpdatedAt: Date | null;
  bestPickTimeStartAt: Date | null; bestPickTimeEndAt: Date | null;
  sourceProvider: string; createdAt: Date;
};

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const normalizeMaskedPhone = (value: string | null) => value?.trim().toLowerCase().replace(/[\s\-()]/g, "") || "";
export const normalizeMaskedAddress = (value: string | null) => value?.trim().toLowerCase().replace(/\s+/g, " ") || "";
export const pickupGroupingKey = (row: PickupScheduleRow) => `waybill:${row.waybillNo.trim().toLowerCase()}`;

function timeValue(value: Date | null) { return value?.getTime() ?? Number.NEGATIVE_INFINITY; }
function externalOrder(value: string | null) {
  if (!value) return 0n;
  try { return BigInt(value); } catch { return 0n; }
}

export function comparePickupScheduleLatest(a: PickupScheduleRow, b: PickupScheduleRow) {
  return timeValue(b.sourceUpdatedAt) - timeValue(a.sourceUpdatedAt)
    || timeValue(b.sourceInputAt) - timeValue(a.sourceInputAt)
    || (externalOrder(b.externalJfsId) > externalOrder(a.externalJfsId) ? 1
      : externalOrder(b.externalJfsId) < externalOrder(a.externalJfsId) ? -1 : b.id.localeCompare(a.id));
}

export function projectLatestPickupSchedules(rows: PickupScheduleRow[]) {
  const byWaybill = new Map<string, PickupScheduleRow[]>();
  for (const row of rows) {
    const key = row.waybillNo.trim().toLowerCase();
    if (!key) continue;
    byWaybill.set(key, [...(byWaybill.get(key) || []), row]);
  }
  return [...byWaybill.values()].map(group => [...group].sort(comparePickupScheduleLatest)[0]!);
}

export function isPickupAssigned(row: Pick<PickupScheduleRow, "pickStaffCode" | "pickStaffName">) {
  return Boolean(row.pickStaffCode?.trim() || row.pickStaffName?.trim());
}
export function isPickupFailed(row: Pick<PickupScheduleRow, "pickFailReason" | "pickFailAt" | "pickFailTimes">) {
  return Boolean(row.pickFailReason?.trim() || row.pickFailAt || (row.pickFailTimes || 0) > 0);
}

export function pickupAgeLabel(businessDate: Date | string, today = jakartaOperationalDate()) {
  const value = businessDate instanceof Date ? businessDate.toISOString().slice(0, 10) : businessDate;
  const days = Math.max(0, Math.floor((Date.parse(`${today}T00:00:00.000Z`) - Date.parse(`${value}T00:00:00.000Z`)) / 86_400_000));
  if (days === 0) return "Hari Ini";
  if (days === 1) return "1 Hari";
  if (days === 2) return "2 Hari";
  return "3 Hari+";
}

export function groupPickupSchedules(rows: PickupScheduleRow[]) {
  return projectLatestPickupSchedules(rows).map(row => ({
    groupId: digest(`pickup-schedule:${row.id}`),
    recordId: row.id,
    externalJfsId: row.externalJfsId,
    sourceProvider: row.sourceProvider,
    sellerName: row.senderNameMasked || row.customerName,
    senderPhoneMasked: row.senderPhoneMasked,
    pickupAddressMasked: row.pickupAddressMasked,
    outletCode: row.sourceOutletCode,
    representativeOrderId: row.sourceOrderId,
    representativeWaybill: row.waybillNo,
    orders: [{
      id: row.id, waybill: row.waybillNo, source: row.sourcePlatform, goodsName: row.goodsName,
      weight: Number(row.weight), status: row.sourceStatus, statusCode: row.orderStatusCode,
      businessDate: row.businessDate.toISOString().slice(0, 10), ageLabel: pickupAgeLabel(row.businessDate),
      inputTime: row.sourceInputAt?.toISOString() || null, sendName: row.sendName,
      senderCompany: row.senderCompany, senderCity: row.senderCityName, senderArea: row.senderAreaName,
      pickupStaff: row.pickStaffName || row.pickStaffCode, pickupNetwork: row.pickNetworkName || row.sourceNetworkCode,
      assigned: isPickupAssigned(row), pickupFailed: isPickupFailed(row), pickFailReason: row.pickFailReason,
      bestPickTime: row.bestPickTimeStartAt?.toISOString() || row.bestPickTimeEndAt?.toISOString() || null,
    }],
  }));
}

type ListInput = {
  tenantId: string; outletId: string; startDate: string; endDate: string;
  waybill: string; senderName: string; sourcePlatform: string; orderStatus: string;
  sendName: string; pickupNetwork: string; pickupStaff: string; assignment: string;
  pickupFailure: string; senderCity: string; senderArea: string; page: number; pageSize: number;
};

function includes(value: string | null, search: string) { return !search || (value || "").toLowerCase().includes(search.toLowerCase()); }
function matches(row: PickupScheduleRow, input: ListInput) {
  const senderSearch = input.senderName.toLowerCase();
  return includes(row.waybillNo, input.waybill)
    && (!senderSearch || [row.senderNameMasked, row.customerName, row.customerId].some(value => includes(value, senderSearch)))
    && includes(row.sourcePlatform, input.sourcePlatform)
    && (!input.orderStatus || String(row.orderStatusCode || "") === input.orderStatus || includes(row.sourceStatus, input.orderStatus))
    && includes(row.sendName, input.sendName)
    && (!input.pickupNetwork || [row.pickNetworkName, row.sourceNetworkCode].some(value => includes(value, input.pickupNetwork)))
    && (!input.pickupStaff || [row.pickStaffName, row.pickStaffCode].some(value => includes(value, input.pickupStaff)))
    && (input.assignment === "ALL" || (input.assignment === "ASSIGNED") === isPickupAssigned(row))
    && (input.pickupFailure === "ALL" || (input.pickupFailure === "FAILED") === isPickupFailed(row))
    && includes(row.senderCityName, input.senderCity) && includes(row.senderAreaName, input.senderArea);
}

async function scopedRows(input: Pick<ListInput, "tenantId" | "outletId" | "startDate" | "endDate">) {
  const rows = await prisma.rawPickupSchedule.findMany({
    where: { tenantId: input.tenantId, outletId: input.outletId,
      sourceProvider: PICKUP_SCHEDULING_PROVIDER,
      businessDate: { gte: new Date(`${input.startDate}T00:00:00.000Z`), lte: new Date(`${input.endDate}T00:00:00.000Z`) } },
    orderBy: [{ sourceUpdatedAt: "desc" }, { sourceInputAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.filter(row => row.sourceProvider === PICKUP_SCHEDULING_PROVIDER);
}

export async function listPickupScheduling(input: ListInput) {
  const projected = projectLatestPickupSchedules(await scopedRows(input) as PickupScheduleRow[]).filter(row => matches(row, input));
  const groups = groupPickupSchedules(projected);
  return {
    summary: { totalWaybills: groups.length, totalGroups: groups.length,
      validMaskedPhones: groups.filter(group => Boolean(group.senderPhoneMasked)).length },
    pagination: { page: input.page, pageSize: input.pageSize, total: groups.length,
      totalPages: Math.ceil(groups.length / input.pageSize) },
    groups: groups.slice((input.page - 1) * input.pageSize, input.page * input.pageSize),
  };
}

export async function resolvePickupGroup(input: {
  tenantId: string; outletId: string; startDate: string; endDate: string; groupId: string;
}) {
  const rows = await scopedRows(input) as PickupScheduleRow[];
  return groupPickupSchedules(rows).find(group => group.groupId === input.groupId) || null;
}
