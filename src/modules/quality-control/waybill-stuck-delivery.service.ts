import "server-only";
import { prisma } from "@/lib/db/prisma";

export function isVoidStatus(value: string | null | undefined) {
  return ["1", "true", "yes", "ya", "void", "是"].includes(
    (value ?? "").normalize("NFKC").trim().toLocaleLowerCase("id-ID"),
  );
}

type InventoryRow = {
  id: string;
  businessDate: Date;
  billCode: string;
  customerName: string | null;
  goodsName: string | null;
  inventoryHours: number;
  abnormalRegisterTime: string | null;
  updatedAt: Date;
};
type StatusRow = {
  sourceWaybill: string;
  currentScanSite: string | null;
  currentScanTime: string | null;
  currentScanType: string | null;
  scanType: string | null;
  problemReason: string | null;
  isVoid: string | null;
  statusFound: boolean;
  syncedAt: Date;
  updatedAt: Date;
};

export function joinInventoryWithStatus(
  inventory: InventoryRow[],
  statuses: StatusRow[],
) {
  const latestStatus = new Map<string, StatusRow>();
  for (const status of statuses) {
    const existing = latestStatus.get(status.sourceWaybill);
    const candidateOrder = `${status.syncedAt.toISOString()}:${status.currentScanTime ?? ""}:${status.updatedAt.toISOString()}`;
    const existingOrder = existing
      ? `${existing.syncedAt.toISOString()}:${existing.currentScanTime ?? ""}:${existing.updatedAt.toISOString()}`
      : "";
    if (!existing || candidateOrder > existingOrder) {
      latestStatus.set(status.sourceWaybill, status);
    }
  }
  return inventory.map((row) => {
    const statusRecord = latestStatus.get(row.billCode);
    const status = statusRecord?.statusFound ? statusRecord : undefined;
    const voided = status ? isVoidStatus(status.isVoid) : false;
    const displayStatus = !status
      ? "STATUS_NOT_FOUND" as const
      : voided
        ? "VOID" as const
        : status.problemReason?.trim()
          ? "PROBLEM" as const
          : "NORMAL" as const;
    return {
      id: row.id,
      businessDate: row.businessDate.toISOString().slice(0, 10),
      waybill: row.billCode,
      customer: row.customerName,
      goodsName: row.goodsName,
      inventoryHours: row.inventoryHours,
      abnormalRegisterTime: row.abnormalRegisterTime,
      currentScanSite: status?.currentScanSite ?? null,
      currentScanTime: status?.currentScanTime ?? null,
      currentScanType: status?.currentScanType ?? null,
      scanType: status?.scanType ?? null,
      problemReason: status?.problemReason ?? null,
      void: status?.isVoid ?? null,
      statusFound: Boolean(status),
      status: displayStatus,
    };
  });
}

export function summarizeWaybillStuck(
  rows: ReturnType<typeof joinInventoryWithStatus>,
) {
  return {
    totalInventory: rows.length,
    uniqueWaybills: new Set(rows.map((row) => row.waybill)).size,
    statusFound: rows.filter((row) => row.statusFound).length,
    statusNotFound: rows.filter((row) => !row.statusFound).length,
    totalProblem: rows.filter((row) => row.problemReason?.trim()).length,
    totalVoid: rows.filter((row) => row.status === "VOID").length,
    averageInventoryHours: rows.length
      ? Number(
          (
            rows.reduce((total, row) => total + row.inventoryHours, 0) /
            rows.length
          ).toFixed(2),
        )
      : 0,
  };
}

export async function listWaybillStuckDelivery(input: {
  tenantId: string;
  outletId: string;
  businessDate: string;
  waybill?: string;
  customer?: string;
  goodsName?: string;
  currentScanSite?: string;
  problem?: string;
  void?: "" | "true" | "false";
  page: number;
  pageSize: number;
}) {
  const businessDate = new Date(`${input.businessDate}T00:00:00.000Z`);
  const inventory = await prisma.rawInventoryDetail.findMany({
    where: {
      tenantId: input.tenantId,
      outletId: input.outletId,
      businessDate,
      ...(input.waybill
        ? { billCode: { contains: input.waybill, mode: "insensitive" } }
        : {}),
      ...(input.customer
        ? { customerName: { contains: input.customer, mode: "insensitive" } }
        : {}),
      ...(input.goodsName
        ? { goodsName: { contains: input.goodsName, mode: "insensitive" } }
        : {}),
    },
    select: {
      id: true,
      businessDate: true,
      billCode: true,
      customerName: true,
      goodsName: true,
      inventoryHours: true,
      abnormalRegisterTime: true,
      updatedAt: true,
    },
    orderBy: [{ inventoryHours: "desc" }, { billCode: "asc" }],
  });
  const billCodes = [...new Set(inventory.map((row) => row.billCode))];
  const statuses = billCodes.length
    ? await prisma.rawWaybillStatus.findMany({
        where: {
          tenantId: input.tenantId,
          outletId: input.outletId,
          businessDate,
          sourceWaybill: { in: billCodes },
        },
        select: {
          sourceWaybill: true,
          currentScanSite: true,
          currentScanTime: true,
          currentScanType: true,
          scanType: true,
          problemReason: true,
          isVoid: true,
          statusFound: true,
          syncedAt: true,
          updatedAt: true,
        },
      })
    : [];
  const joined = joinInventoryWithStatus(inventory, statuses);
  const filtered = joined
    .filter(
      (row) =>
        !input.currentScanSite ||
        row.currentScanSite
          ?.toLocaleLowerCase("id-ID")
          .includes(input.currentScanSite.toLocaleLowerCase("id-ID")),
    )
    .filter(
      (row) =>
        !input.problem ||
        row.problemReason
          ?.toLocaleLowerCase("id-ID")
          .includes(input.problem.toLocaleLowerCase("id-ID")),
    )
    .filter(
      (row) =>
        !input.void ||
        isVoidStatus(row.void) === (input.void === "true"),
    );
  const start = (input.page - 1) * input.pageSize;
  return {
    data: filtered.slice(start, start + input.pageSize),
    summary: summarizeWaybillStuck(filtered),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total: filtered.length,
      totalPages: Math.ceil(filtered.length / input.pageSize),
    },
  };
}
