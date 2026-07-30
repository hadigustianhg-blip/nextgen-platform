import "server-only";
import { prisma } from "@/lib/db/prisma";

const normalized = (value: string | null) =>
  (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");

export function maskReceiverName(value: string | null) {
  const name = value?.trim();
  if (!name) return null;
  return name
    .split(/\s+/)
    .map((part) => `${part.slice(0, 1)}${"*".repeat(Math.max(2, part.length - 1))}`)
    .join(" ");
}

export async function listProblemWaybillDelivery(input: {
  tenantId: string;
  outletId: string;
  businessDate?: string;
  waybill?: string;
  courierName?: string;
  page: number;
  pageSize: number;
  sortBy: "businessDate" | "waybill" | "courierName" | "lastUpdatedAt";
  sortOrder: "asc" | "desc";
}) {
  const where = {
    tenantId: input.tenantId,
    outletId: input.outletId,
    deliveryStatusRaw: { equals: "Belum Diterima", mode: "insensitive" as const },
    ...(input.businessDate
      ? { operationalDate: new Date(`${input.businessDate}T00:00:00.000Z`) }
      : {}),
    ...(input.waybill
      ? { waybillNo: { contains: input.waybill, mode: "insensitive" as const } }
      : {}),
    ...(input.courierName
      ? { courierNameRaw: { contains: input.courierName, mode: "insensitive" as const } }
      : {}),
  };
  const orderField = {
    businessDate: "operationalDate",
    waybill: "waybillNo",
    courierName: "courierNameRaw",
    lastUpdatedAt: "updatedAt",
  }[input.sortBy];
  const [total, courierGroups, rows] = await Promise.all([
    prisma.rawDispatch.count({ where }),
    prisma.rawDispatch.groupBy({
      by: ["courierNameRaw"],
      where,
      _count: { _all: true },
    }),
    prisma.rawDispatch.findMany({
      where,
      select: {
        id: true,
        operationalDate: true,
        waybillNo: true,
        courierNameRaw: true,
        deliveryStatusRaw: true,
        receiverName: true,
        updatedAt: true,
      },
      orderBy: [{ [orderField]: input.sortOrder }, { id: "desc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
  ]);
  return {
    data: rows.map((row) => ({
      id: row.id,
      businessDate: row.operationalDate.toISOString().slice(0, 10),
      waybill: row.waybillNo,
      courierName: row.courierNameRaw,
      status: row.deliveryStatusRaw,
      receiverNameMasked: maskReceiverName(row.receiverName),
      lastUpdatedAt: row.updatedAt.toISOString(),
    })),
    summary: {
      totalBelumDiterima: total,
      totalWaybill: total,
      totalCourier: courierGroups.filter((group) => normalized(group.courierNameRaw)).length,
    },
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.ceil(total / input.pageSize),
    },
  };
}
