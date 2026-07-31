import "server-only";
import { prisma } from "@/lib/db/prisma";
import { selectLatestDispatchRecords } from "./dispatch-deduplication";

export const canonicalDispatchText = (value: string | null | undefined) =>
  (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ")
    .toLocaleUpperCase("id-ID");

export async function getActiveDispatchDataset(input: {
  tenantId: string;
  outletId: string;
  operationalDate: Date;
}) {
  const records = await prisma.rawDispatch.findMany({
    where: {
      tenantId: input.tenantId,
      outletId: input.outletId,
      operationalDate: input.operationalDate,
      syncStatus: "NORMALIZED",
      isActive: true,
    },
    select: {
      id: true,
      operationalDate: true,
      waybillNo: true,
      courierNameRaw: true,
      deliveryStatusRaw: true,
      receiverName: true,
      syncStatus: true,
      isActive: true,
      sourceRecordKey: true,
      sourceFetchedAt: true,
      dispatchAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [
      { sourceFetchedAt: "desc" },
      { dispatchAt: "desc" },
      { updatedAt: "desc" },
    ],
  });
  const finalRecords = selectLatestDispatchRecords(records);
  if (records.length !== finalRecords.length) {
    console.warn("ACTIVE_DISPATCH_DUPLICATE_WAYBILL", {
      activeRecordCount: records.length,
      uniqueWaybillCount: finalRecords.length,
    });
  }
  return finalRecords;
}
