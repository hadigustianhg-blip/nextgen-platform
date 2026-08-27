import { prisma } from "../src/lib/db/prisma";
import { summarizeSla, SLA_TARGET } from "../src/modules/quality-control/sla-cut-off.calculation";

async function main() {
  console.log("=== START DELETION OF SLA CUT OFF SNAPSHOT FOR 2026-08-28 ===");

  const outletCode = "SUM001A";
  const targetDateStr = "2026-08-28";
  const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);

  // 1. Find Outlet SUM001A
  const outlet = await prisma.outlet.findFirst({
    where: { code: outletCode, isActive: true },
    select: { id: true, tenantId: true, code: true }
  });

  if (!outlet) {
    throw new Error(`Outlet ${outletCode} not found`);
  }

  // 2. Query target records before deletion
  const records = await prisma.rawSlaCutOff.findMany({
    where: {
      tenantId: outlet.tenantId,
      outletId: outlet.id,
      businessDate: targetDate
    }
  });

  console.log(`Found ${records.length} record(s) matching outlet ${outlet.code} and date ${targetDateStr}:`);
  for (const r of records) {
    console.log(`- ID: ${r.id} | Key: ${r.sourceRecordKey} | SLA: ${r.sla}% | Sampai: ${r.paketSampai}`);
  }

  if (records.length === 0) {
    console.log("No record found to delete. Exiting.");
    return;
  }

  // 3. Delete ONLY the target records
  console.log("\nDeleting target snapshot record(s)...");
  const deleteResult = await prisma.rawSlaCutOff.deleteMany({
    where: {
      tenantId: outlet.tenantId,
      outletId: outlet.id,
      businessDate: targetDate
    }
  });

  console.log(`Successfully deleted ${deleteResult.count} record(s).`);

  // 4. Verify post-deletion state for period 21 Aug 2026 - 20 Sep 2026
  console.log("\n=== VERIFYING REMAINING RECORDS (2026-08-21 to 2026-09-20) ===");
  const remainingRows = await prisma.rawSlaCutOff.findMany({
    where: {
      tenantId: outlet.tenantId,
      outletId: outlet.id,
      businessDate: {
        gte: new Date("2026-08-21T00:00:00.000Z"),
        lte: new Date("2026-09-20T23:59:59.999Z")
      },
      syncStatus: "NORMALIZED"
    },
    orderBy: { businessDate: "desc" }
  });

  const items = remainingRows.map((row) => ({
    businessDate: row.businessDate.toISOString().slice(0, 10),
    sla: Number(row.sla),
    paketSampai: row.paketSampai,
    sudahTandaTerima: row.sudahTandaTerima,
    belumTandaTerima: row.belumTandaTerima,
    lewatSla: row.lewatSla,
    status: Number(row.sla) >= SLA_TARGET ? ("ACHIEVE" as const) : ("NOT_ACHIEVE" as const),
  }));

  const canonicalSummary = summarizeSla(items);

  console.log("\nRecalculated Period Summary (21 Aug 2026 - 20 Sep 2026):");
  console.log("Average SLA:", canonicalSummary.averageSla + "%");
  console.log("Total Paket Sampai:", canonicalSummary.totalPaketSampai);
  console.log("Sudah Tanda Terima:", canonicalSummary.sudahTandaTerima);
  console.log("Belum Tanda Terima:", canonicalSummary.belumTandaTerima);
  console.log("Lewat SLA:", canonicalSummary.lewatSla);
  console.log("Hari Achieve:", canonicalSummary.hariAchieve);
  console.log("Hari Not Achieve:", canonicalSummary.hariNotAchieve);
  console.log("Overall Status:", canonicalSummary.status);

  console.log("\nRemaining Daily Rows:");
  for (const item of items) {
    console.log(`- Date: ${item.businessDate} | SLA: ${item.sla}% | Sampai: ${item.paketSampai} | Sudah: ${item.sudahTandaTerima} | Belum: ${item.belumTandaTerima} | Lewat: ${item.lewatSla} | Status: ${item.status}`);
  }

  // 5. Confirm 2026-08-28 is NOT in the list
  const containsAug28 = items.some(i => i.businessDate === "2026-08-28");
  if (containsAug28) {
    throw new Error("ERROR: Date 2026-08-28 is still present in the list!");
  } else {
    console.log("\nCONFIRMED: Date 2026-08-28 has been completely removed.");
  }
}

main().catch(err => {
  console.error("Deletion failed:", err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
