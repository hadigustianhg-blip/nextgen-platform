import { PrismaClient } from "@prisma/client";
import { selectLatestDispatchRecords } from "../src/modules/delivery-settlement/dispatch-deduplication";

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(
    prefix.length,
  );
}

const tenantId = argument("tenantId");
const outletId = argument("outletId");
const businessDate = argument("date");
const apply = process.argv.includes("--apply");

if (!tenantId || !outletId || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate ?? "")) {
  throw new Error(
    "Gunakan --tenantId=<uuid> --outletId=<uuid> --date=YYYY-MM-DD [--apply]",
  );
}

const prisma = new PrismaClient();
try {
  const operationalDate = new Date(`${businessDate}T00:00:00.000Z`);
  const records = await prisma.rawDispatch.findMany({
    where: {
      tenantId,
      outletId,
      operationalDate,
      syncStatus: "NORMALIZED",
    },
    select: {
      id: true,
      waybillNo: true,
      sourceFetchedAt: true,
      dispatchAt: true,
      updatedAt: true,
      createdAt: true,
      isActive: true,
    },
  });
  const finalRecords = selectLatestDispatchRecords(records);
  const finalIds = finalRecords.map((record) => record.id);
  const preview = {
    mode: apply ? "APPLY" : "DRY_RUN",
    businessDate,
    totalRecords: records.length,
    uniqueWaybills: finalRecords.length,
    duplicateExtraRecords: records.length - finalRecords.length,
    currentlyActive: records.filter((record) => record.isActive).length,
    willRemainActive: finalRecords.length,
    willBeSuperseded: records.length - finalRecords.length,
  };
  process.stdout.write(`${JSON.stringify(preview, null, 2)}\n`);
  if (apply) {
    await prisma.$transaction(async (tx) => {
      await tx.rawDispatch.updateMany({
        where: { tenantId, outletId, operationalDate },
        data: { isActive: false },
      });
      if (finalIds.length) {
        await tx.rawDispatch.updateMany({
          where: { id: { in: finalIds }, tenantId, outletId, operationalDate },
          data: { isActive: true },
        });
      }
    });
    process.stdout.write("Reconciliation applied.\n");
  }
} finally {
  await prisma.$disconnect();
}
