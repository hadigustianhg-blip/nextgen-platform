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

export type PickupOperationalRow = {
  rowId: string; recordId: string; externalJfsId: string | null; sourceProvider: string;
  waybill: string; inputTime: string | null; businessDate: string; source: string | null;
  status: string | null; statusCode: number | null; sendName: string | null;
  senderName: string | null; senderCompany: string | null; senderPhoneMasked: string | null;
  senderCity: string | null; senderArea: string | null; pickupAddressMasked: string | null;
  pickupStaff: string | null; pickupStaffCode: string | null; pickupNetwork: string | null;
  bestPickTime: string | null; goodsName: string | null; weight: number;
  assigned: boolean; pickupFailed: boolean; pickFailReason: string | null; ageLabel: string;
  outletCode: string | null;
};

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const scheduleRowId = (row: Pick<PickupScheduleRow, "id">) => digest(`pickup-schedule:${row.id}`);
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
export function toPickupOperationalRow(row: PickupScheduleRow): PickupOperationalRow {
  return {
    rowId: scheduleRowId(row), recordId: row.id, externalJfsId: row.externalJfsId,
    sourceProvider: row.sourceProvider, waybill: row.waybillNo,
    inputTime: row.sourceInputAt?.toISOString() || null,
    businessDate: row.businessDate.toISOString().slice(0, 10), source: row.sourcePlatform,
    status: row.sourceStatus, statusCode: row.orderStatusCode, sendName: row.sendName,
    senderName: row.senderNameMasked || row.customerName, senderCompany: row.senderCompany,
    senderPhoneMasked: row.senderPhoneMasked, senderCity: row.senderCityName,
    senderArea: row.senderAreaName, pickupAddressMasked: row.pickupAddressMasked,
    pickupStaff: row.pickStaffName || row.pickStaffCode, pickupStaffCode: row.pickStaffCode,
    pickupNetwork: row.pickNetworkName || row.sourceNetworkCode,
    bestPickTime: row.bestPickTimeStartAt?.toISOString() || row.bestPickTimeEndAt?.toISOString() || null,
    goodsName: row.goodsName, weight: Number(row.weight), assigned: isPickupAssigned(row),
    pickupFailed: isPickupFailed(row), pickFailReason: row.pickFailReason,
    ageLabel: pickupAgeLabel(row.businessDate), outletCode: row.sourceOutletCode,
  };
}
export function comparePickupOperationalRows(a: PickupOperationalRow, b: PickupOperationalRow) {
  return (a.senderName || "").localeCompare(b.senderName || "", "id", { sensitivity: "base" })
    || timeValue(b.inputTime ? new Date(b.inputTime) : null) - timeValue(a.inputTime ? new Date(a.inputTime) : null)
    || a.rowId.localeCompare(b.rowId);
}

/** @deprecated Compatibility helper for the legacy detail route. */
export function groupPickupSchedules(rows: PickupScheduleRow[]) {
  return projectLatestPickupSchedules(rows).map(row => {
    const item = toPickupOperationalRow(row);
    return {
      groupId: item.rowId, recordId: item.recordId, externalJfsId: item.externalJfsId,
      sourceProvider: item.sourceProvider, sellerName: item.senderName,
      senderPhoneMasked: item.senderPhoneMasked, pickupAddressMasked: item.pickupAddressMasked,
      outletCode: item.outletCode, representativeOrderId: row.sourceOrderId,
      representativeWaybill: item.waybill,
      orders: [{ id: item.recordId, waybill: item.waybill, source: item.source,
        goodsName: item.goodsName, weight: item.weight, status: item.status, statusCode: item.statusCode,
        businessDate: item.businessDate, ageLabel: item.ageLabel, inputTime: item.inputTime,
        sendName: item.sendName, senderCompany: item.senderCompany, senderCity: item.senderCity,
        senderArea: item.senderArea, pickupStaff: item.pickupStaff, pickupNetwork: item.pickupNetwork,
        assigned: item.assigned, pickupFailed: item.pickupFailed, pickFailReason: item.pickFailReason,
        bestPickTime: item.bestPickTime }],
    };
  });
}

type ListInput = {
  tenantId: string; outletId: string; startDate: string; endDate: string;
  orderStatus: string; sendName: string; pickupStaff: string;
  page: number; pageSize: number;
};
function includes(value: string | null, search: string) {
  return !search || (value || "").toLowerCase().includes(search.toLowerCase());
}
function matches(row: PickupScheduleRow, input: ListInput) {
  return (!input.orderStatus || String(row.orderStatusCode || "") === input.orderStatus || row.sourceStatus === input.orderStatus)
    && (!input.sendName || row.sendName === input.sendName)
    && (!input.pickupStaff || row.pickStaffCode === input.pickupStaff || row.pickStaffName === input.pickupStaff
      || includes(row.pickStaffName, input.pickupStaff));
}
const option = (value: string, label = value) => ({ value, label });
const uniqueOptions = (values: Array<{ value: string; label: string }>) => [...new Map(values
  .filter(item => item.value.trim()).map(item => [item.value, item])).values()]
  .sort((a, b) => a.label.localeCompare(b.label, "id", { sensitivity: "base" }));

async function scopedRows(input: Pick<ListInput, "tenantId" | "outletId" | "startDate" | "endDate">) {
  const rows = await prisma.rawPickupSchedule.findMany({
    where: { tenantId: input.tenantId, outletId: input.outletId, sourceProvider: PICKUP_SCHEDULING_PROVIDER,
      businessDate: { gte: new Date(`${input.startDate}T00:00:00.000Z`), lte: new Date(`${input.endDate}T00:00:00.000Z`) } },
    orderBy: [{ sourceUpdatedAt: "desc" }, { sourceInputAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.filter(row => row.sourceProvider === PICKUP_SCHEDULING_PROVIDER) as PickupScheduleRow[];
}
export async function listPickupScheduling(input: ListInput) {
  const projected = projectLatestPickupSchedules(await scopedRows(input));
  const rows = projected.filter(row => matches(row, input)).map(toPickupOperationalRow).sort(comparePickupOperationalRows);
  const filterOptions = {
    statuses: uniqueOptions(projected.filter(row => row.sourceStatus || row.orderStatusCode !== null).map(row =>
      option(row.orderStatusCode === null ? row.sourceStatus || "" : String(row.orderStatusCode),
        [row.orderStatusCode, row.sourceStatus].filter(value => value !== null && value !== "").join(" · ")))),
    methods: uniqueOptions(projected.filter(row => row.sendName).map(row => option(row.sendName!, row.sendName!))),
    pickupStaff: uniqueOptions(projected.filter(row => row.pickStaffName || row.pickStaffCode).map(row =>
      option(row.pickStaffCode || row.pickStaffName!, row.pickStaffName || row.pickStaffCode!))),
  };
  return {
    summary: { totalWaybills: rows.length, totalSchedules: rows.length,
      validMaskedPhones: rows.filter(row => Boolean(row.senderPhoneMasked)).length },
    pagination: { page: input.page, pageSize: input.pageSize, total: rows.length,
      totalPages: Math.ceil(rows.length / input.pageSize) },
    filterOptions,
    rows: rows.slice((input.page - 1) * input.pageSize, input.page * input.pageSize),
  };
}
export async function resolvePickupRecord(input: {
  tenantId: string; outletId: string; startDate: string; endDate: string; rowId: string;
}) {
  const rows = projectLatestPickupSchedules(await scopedRows(input));
  const row = rows.find(item => scheduleRowId(item) === input.rowId);
  return row ? toPickupOperationalRow(row) : null;
}
export async function resolvePickupGroup(input: {
  tenantId: string; outletId: string; startDate: string; endDate: string; groupId: string;
}) {
  return resolvePickupRecord({ ...input, rowId: input.groupId });
}
