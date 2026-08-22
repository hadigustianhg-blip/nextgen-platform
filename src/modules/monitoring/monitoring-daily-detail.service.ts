import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getActiveDispatchDataset } from "@/modules/delivery-settlement/active-dispatch-dataset";
import { buildMonitoringDailyDetail, type MonitoringDetailMetric } from "./monitoring-daily-detail";

export async function getMonitoringDailyDetail(input: {
  tenantId: string;
  outletId: string;
  businessDate: string;
  metric: MonitoringDetailMetric;
  team?: string;
}) {
  const operationalDate = new Date(`${input.businessDate}T00:00:00.000Z`);
  const [deliveryRecords, pickupRecords] = await Promise.all([
    getActiveDispatchDataset({ tenantId: input.tenantId, outletId: input.outletId, operationalDate }),
    prisma.rawPickup.findMany({
      where: { tenantId: input.tenantId, outletId: input.outletId, operationalDate, syncStatus: "NORMALIZED" },
      select: {
        id: true, operationalDate: true, waybillNo: true, staffNameRaw: true,
        senderName: true, settlementRaw: true, freight: true, weight: true,
        sourceFetchedAt: true, updatedAt: true,
      },
    }),
  ]);
  return buildMonitoringDailyDetail({ ...input, deliveryRecords, pickupRecords });
}
