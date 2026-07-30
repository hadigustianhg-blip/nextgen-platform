import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";

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
      })),
    };
  });
}

export async function listPickupScheduling(input: {
  tenantId: string; outletId: string; businessDate: string;
  waybill: string; sender: string; source: string;
}) {
  const rows = await prisma.rawPickupSchedule.findMany({
    where: {
      tenantId: input.tenantId, outletId: input.outletId,
      businessDate: new Date(`${input.businessDate}T00:00:00.000Z`),
    },
    orderBy: [{ sourceInputTime: "asc" }, { createdAt: "asc" }],
  });
  const groups = groupPickupSchedules(rows).filter((group) => {
    const waybill = input.waybill.toLowerCase();
    const sender = input.sender.toLowerCase();
    const source = input.source.toLowerCase();
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
    groups,
  };
}

export async function resolvePickupGroup(input: {
  tenantId: string; outletId: string; businessDate: string; groupId: string;
}) {
  const rows = await prisma.rawPickupSchedule.findMany({
    where: {
      tenantId: input.tenantId, outletId: input.outletId,
      businessDate: new Date(`${input.businessDate}T00:00:00.000Z`),
    },
    orderBy: [{ sourceInputTime: "asc" }, { createdAt: "asc" }],
  });
  return groupPickupSchedules(rows).find((group) => group.groupId === input.groupId) || null;
}
