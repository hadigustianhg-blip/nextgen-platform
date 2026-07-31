import "server-only";
import {
  canonicalDispatchText,
  getActiveDispatchDataset,
} from "@/modules/delivery-settlement/active-dispatch-dataset";
import { resolveJakartaOperationalDate } from "@/lib/dates/jakarta-date";

export const isBelumDiterima = (value: string | null | undefined) =>
  canonicalDispatchText(value) === "BELUM DITERIMA";

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
  const businessDate = resolveJakartaOperationalDate(input.businessDate ?? "");
  const operationalDate = new Date(`${businessDate}T00:00:00.000Z`);
  const finalRecords = await getActiveDispatchDataset({
    tenantId: input.tenantId,
    outletId: input.outletId,
    operationalDate,
  });
  const waybillFilter = canonicalDispatchText(input.waybill);
  const courierFilter = canonicalDispatchText(input.courierName);
  const problemRecords = finalRecords.filter((row) =>
    isBelumDiterima(row.deliveryStatusRaw)
  );
  const monitoringPending = finalRecords.filter((row) =>
    canonicalDispatchText(row.deliveryStatusRaw) !== "PENERIMAAN NORMAL"
  );
  if (monitoringPending.length !== problemRecords.length) {
    const statusBreakdown = monitoringPending.reduce<Record<string, number>>((result, row) => {
      const status = canonicalDispatchText(row.deliveryStatusRaw) || "(KOSONG)";
      result[status] = (result[status] ?? 0) + 1;
      return result;
    }, {});
    console.warn("PROBLEM_DELIVERY_MONITORING_PENDING_MISMATCH", {
      monitoringPending: monitoringPending.length,
      belumDiterima: problemRecords.length,
      statusBreakdown,
    });
  }
  const dataset = problemRecords.filter((row) =>
    (!waybillFilter || canonicalDispatchText(row.waybillNo).includes(waybillFilter)) &&
    (!courierFilter || canonicalDispatchText(row.courierNameRaw).includes(courierFilter))
  );
  const direction = input.sortOrder === "asc" ? 1 : -1;
  const rows = [...dataset].sort((left, right) => {
    const values = {
      businessDate: [left.operationalDate.getTime(), right.operationalDate.getTime()],
      waybill: [canonicalDispatchText(left.waybillNo), canonicalDispatchText(right.waybillNo)],
      courierName: [canonicalDispatchText(left.courierNameRaw), canonicalDispatchText(right.courierNameRaw)],
      lastUpdatedAt: [left.updatedAt.getTime(), right.updatedAt.getTime()],
    }[input.sortBy];
    return (values[0] < values[1] ? -1 : values[0] > values[1] ? 1 : right.id.localeCompare(left.id)) * direction;
  });
  const total = rows.length;
  const pageRows = rows.slice((input.page - 1) * input.pageSize, input.page * input.pageSize);
  const couriers = new Set(rows.map((row) =>
    canonicalDispatchText(row.courierNameRaw) || "TEAM BELUM TERPETAKAN"
  ));
  return {
    data: pageRows.map((row) => ({
      id: row.id,
      businessDate: row.operationalDate.toISOString().slice(0, 10),
      waybill: row.waybillNo,
      courierName: row.courierNameRaw,
      status: "Belum diterima",
      receiverNameMasked: maskReceiverName(row.receiverName),
      lastUpdatedAt: row.updatedAt.toISOString(),
    })),
    summary: {
      totalBelumDiterima: total,
      totalWaybill: total,
      totalCourier: couriers.size,
    },
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.ceil(total / input.pageSize),
    },
  };
}
