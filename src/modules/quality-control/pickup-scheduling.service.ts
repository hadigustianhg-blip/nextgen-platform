import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { jakartaOperationalDate } from "@/lib/dates/jakarta-date";

export type PickupScheduleRow = {
  id: string; businessDate: Date; sourceOrderId: string; waybillNo: string;
  customerId: string | null; senderNameMasked: string | null;
  senderPhoneMasked: string | null; pickupAddressMasked: string | null;
  sourcePlatform: string | null; goodsName: string | null; weight: unknown;
  sourceStatus: string | null; sourceOutletCode: string | null;
};

const normalized = (value: string | null) =>
  value?.trim().toLowerCase().replace(/\s+/g, " ") || "";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export function pickupGroupingKey(row: PickupScheduleRow) {
  if (normalized(row.customerId)) return `customer:${normalized(row.customerId)}`;
  if (normalized(row.senderPhoneMasked)) return `phone:${normalized(row.senderPhoneMasked)}`;
  const name = normalized(row.senderNameMasked);
  const address = normalized(row.pickupAddressMasked);
  if (name && address) return `identity:${name}|${address}`;
  return `name:${name || row.sourceOrderId || row.waybillNo}`;
}

export function groupPickupSchedules(rows: PickupScheduleRow[]) {
  const groups = new Map<string, PickupScheduleRow[]>();
  for (const row of rows) {
    const key = pickupGroupingKey(row);
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return [...groups.entries()].map(([key, orders]) => {
    const representative = orders.find((order) => order.sourceOrderId.trim()) || orders[0];
    const date = orders[0].businessDate.toISOString().slice(0, 10);
    return {
      groupId: digest(`${date}|${key}`),
      sellerName: orders[0].senderNameMasked,
      senderPhoneMasked: orders[0].senderPhoneMasked,
      pickupAddressMasked: orders[0].pickupAddressMasked,
      outletCode: orders.find((order) => order.sourceOutletCode)?.sourceOutletCode || null,
      representativeOrderId: representative.sourceOrderId,
      representativeWaybill: representative.waybillNo,
      orders: orders.map((order) => ({
        id: order.id, waybill: order.waybillNo, source: order.sourcePlatform,
        goodsName: order.goodsName, weight: Number(order.weight),
        status: order.sourceStatus,
        businessDate: order.businessDate.toISOString().slice(0, 10),
        ageLabel: pickupAgeLabel(order.businessDate),
      })),
    };
  });
}

export function pickupAgeLabel(businessDate: Date | string, today = jakartaOperationalDate()) {
  const value = businessDate instanceof Date
    ? businessDate.toISOString().slice(0, 10)
    : businessDate;
  const days = Math.max(0, Math.floor(
    (Date.parse(`${today}T00:00:00.000Z`) - Date.parse(`${value}T00:00:00.000Z`))
      / 86_400_000,
  ));
  if (days === 0) return "Hari Ini";
  if (days === 1) return "1 Hari";
  if (days === 2) return "2 Hari";
  return "3 Hari+";
}

export async function listPickupScheduling(input: {
  tenantId: string; outletId: string; startDate: string; endDate: string;
  waybill: string; senderName: string; sourcePlatform: string;
  page: number; pageSize: number;
}) {
  const rows = await prisma.rawPickupSchedule.findMany({
    where: {
      tenantId: input.tenantId, outletId: input.outletId,
      businessDate: {
        gte: new Date(`${input.startDate}T00:00:00.000Z`),
        lte: new Date(`${input.endDate}T00:00:00.000Z`),
      },
    },
    orderBy: [{ businessDate: "asc" }, { sourceInputTime: "asc" }, { createdAt: "asc" }],
  });
  const groups = groupPickupSchedules(rows).filter((group) => {
    const waybill = input.waybill.toLowerCase();
    const sender = input.senderName.toLowerCase();
    const source = input.sourcePlatform.toLowerCase();
    return (!waybill || group.orders.some((order) => order.waybill.toLowerCase().includes(waybill)))
      && (!sender || (group.sellerName || "").toLowerCase().includes(sender))
      && (!source || group.orders.some((order) => (order.source || "").toLowerCase().includes(source)));
  });
  return {
    summary: {
      totalWaybills: groups.reduce((sum, group) => sum + group.orders.length, 0),
      totalGroups: groups.length,
      validMaskedPhones: groups.filter((group) => Boolean(group.senderPhoneMasked)).length,
    },
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total: groups.length,
      totalPages: Math.ceil(groups.length / input.pageSize),
    },
    groups: groups.slice((input.page - 1) * input.pageSize, input.page * input.pageSize),
  };
}

export async function resolvePickupGroup(input: {
  tenantId: string; outletId: string; startDate: string; endDate: string; groupId: string;
}) {
  const rows = await prisma.rawPickupSchedule.findMany({
    where: {
      tenantId: input.tenantId, outletId: input.outletId,
      businessDate: {
        gte: new Date(`${input.startDate}T00:00:00.000Z`),
        lte: new Date(`${input.endDate}T00:00:00.000Z`),
      },
    },
    orderBy: [{ businessDate: "asc" }, { sourceInputTime: "asc" }, { createdAt: "asc" }],
  });
  return groupPickupSchedules(rows).find((group) => group.groupId === input.groupId) || null;
}
