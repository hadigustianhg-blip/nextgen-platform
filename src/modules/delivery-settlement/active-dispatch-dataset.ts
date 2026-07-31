import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  canonicalDispatchText,
  selectLatestDispatchRecords,
} from "./dispatch-deduplication";

export { canonicalDispatchText };

const dispatchSelect = {
  id: true,
  operationalDate: true,
  waybillNo: true,
  courierNameRaw: true,
  deliveryStatusRaw: true,
  receiverName: true,
  chargeWeight: true,
  syncStatus: true,
  isActive: true,
  sourceRecordKey: true,
  sourceFetchedAt: true,
  dispatchAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RawDispatchSelect;

export type ActiveDispatchRecord = Prisma.RawDispatchGetPayload<{
  select: typeof dispatchSelect;
}>;

type DispatchReader = {
  rawDispatch: {
    findMany(args: Prisma.RawDispatchFindManyArgs): Promise<ActiveDispatchRecord[]>;
  };
};

export async function getActiveDispatchRecords(input: {
  tenantId: string;
  outletId: string;
  operationalDate?: Date;
  periodStart?: Date;
  periodEnd?: Date;
  status?: string;
  courier?: string;
  waybill?: string;
  client?: DispatchReader;
}) {
  const operationalDate = input.operationalDate ?? (
    input.periodStart && input.periodEnd
      ? { gte: input.periodStart, lte: input.periodEnd }
      : undefined
  );
  if (!operationalDate) throw new Error("ACTIVE_DISPATCH_DATE_REQUIRED");
  const records = await (input.client ?? prisma as DispatchReader).rawDispatch.findMany({
    where: {
      tenantId: input.tenantId,
      outletId: input.outletId,
      operationalDate,
      syncStatus: "NORMALIZED",
      isActive: true,
    },
    select: dispatchSelect,
    orderBy: [
      { sourceFetchedAt: "desc" },
      { dispatchAt: "desc" },
      { updatedAt: "desc" },
    ],
  });
  const activeRecords = records.filter((record) =>
    record.isActive && record.syncStatus === "NORMALIZED"
  );
  const finalRecords = selectLatestDispatchRecords(activeRecords);
  if (activeRecords.length !== finalRecords.length) {
    console.warn("ACTIVE_DISPATCH_DUPLICATE_WAYBILL", {
      activeRecordCount: activeRecords.length,
      uniqueWaybillCount: finalRecords.length,
    });
  }
  const status = canonicalDispatchText(input.status);
  const courier = canonicalDispatchText(input.courier);
  const waybill = canonicalDispatchText(input.waybill);
  return finalRecords.filter((record) =>
    (!status || canonicalDispatchText(record.deliveryStatusRaw) === status) &&
    (!courier || canonicalDispatchText(record.courierNameRaw).includes(courier)) &&
    (!waybill || canonicalDispatchText(record.waybillNo).includes(waybill))
  );
}

export const getActiveDispatchDataset = getActiveDispatchRecords;
