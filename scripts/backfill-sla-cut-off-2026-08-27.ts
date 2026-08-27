import { prisma } from "../src/lib/db/prisma";
import { normalizeAgingSign, summarizeSla, SLA_TARGET } from "../src/modules/quality-control/sla-cut-off.calculation";

async function main() {
  console.log("=== START SLA CUT OFF BACKFILL FOR 2026-08-27 ===");

  const JFS_MIDDLEWARE_BASE_URL = process.env.JFS_MIDDLEWARE_BASE_URL || "https://jfs-middleware-v2-production.up.railway.app";
  const JFS_MIDDLEWARE_AUTH_KEY = process.env.JFS_MIDDLEWARE_AUTH_KEY || "NEXTGEN_JFS_SECRET_2026_X9K7";

  const targetDate = "2026-08-27";
  const outletCode = "SUM001A";

  // 1. Find Outlet SUM001A
  const outlet = await prisma.outlet.findFirst({
    where: { code: outletCode, isActive: true },
    select: { id: true, tenantId: true, code: true }
  });

  if (!outlet) {
    throw new Error(`Outlet ${outletCode} not found in database`);
  }

  console.log(`Outlet found: ${outlet.code} (ID: ${outlet.id}, TenantID: ${outlet.tenantId})`);

  // 2. Fetch JFS source data for 2026-08-27 using Emergency Token Mode middleware endpoint
  console.log(`Fetching JFS aging sign data for date ${targetDate}...`);
  const response = await fetch(`${JFS_MIDDLEWARE_BASE_URL}/aging-sign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Key": JFS_MIDDLEWARE_AUTH_KEY,
      "X-JFS-Tenant-Id": outlet.tenantId,
      "X-JFS-Outlet-Id": outlet.id,
      "X-JFS-Outlet-Code": outlet.code
    },
    body: JSON.stringify({ date: targetDate })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Failed to fetch JFS aging sign (${response.status}): ${errorText}`);
  }

  const payload = await response.json();
  if (!payload.success || !payload.data?.data || !Array.isArray(payload.data.data) || payload.data.data.length === 0) {
    throw new Error(`Invalid JFS payload received: ${JSON.stringify(payload)}`);
  }

  const rawItem = payload.data.data[0];
  console.log("Raw JFS Item received:", rawItem);

  const normalized = normalizeAgingSign(rawItem);
  console.log("Normalized AgingSignRecord:", normalized);

  // 3. Prepare Idempotent Upsert
  const businessDate = new Date(`${normalized.queryTime}T00:00:00.000Z`);
  const sourceRecordKey = `${normalized.networkName}:${normalized.queryTime}`;

  const unique = {
    tenantId: outlet.tenantId,
    outletId: outlet.id,
    businessDate,
    sourceRecordKey,
  };

  const data = {
    sourceEndpoint: `${JFS_MIDDLEWARE_BASE_URL}/aging-sign`,
    sourceFetchedAt: new Date(),
    sourcePayload: normalized as any,
    syncStatus: "NORMALIZED" as const,
    sla: Number(normalized.signTimelyRate.replace("%", "")),
    paketSampai: normalized.sendCenterTotal,
    sudahTandaTerima: normalized.signTimelyTotal,
    belumTandaTerima: normalized.signDelayNoSignTotal,
    lewatSla: normalized.signDelayOtherTotal,
  };

  console.log("Upserting snapshot into rawSlaCutOff...");
  const result = await prisma.rawSlaCutOff.upsert({
    where: { tenantId_outletId_businessDate_sourceRecordKey: unique },
    create: { ...data, ...unique },
    update: data,
  });

  console.log("Snapshot successfully saved in DB. Record ID:", result.id);

  // 4. Verify API/Service view for cycle 2026-08-21 to 2026-09-20
  console.log("\n=== VERIFYING PERIOD DATA (2026-08-21 to 2026-09-20) ===");
  const rows = await prisma.rawSlaCutOff.findMany({
    where: {
      tenantId: outlet.tenantId,
      outletId: outlet.id,
      businessDate: {
        gte: new Date("2026-08-21T00:00:00.000Z"),
        lte: new Date("2026-09-20T23:59:59.999Z")
      },
      syncStatus: "NORMALIZED",
    },
    orderBy: { businessDate: "desc" }
  });

  const items = rows.map((row) => ({
    businessDate: row.businessDate.toISOString().slice(0, 10),
    sla: Number(row.sla),
    paketSampai: row.paketSampai,
    sudahTandaTerima: row.sudahTandaTerima,
    belumTandaTerima: row.belumTandaTerima,
    lewatSla: row.lewatSla,
    status: Number(row.sla) >= SLA_TARGET ? ("ACHIEVE" as const) : ("NOT_ACHIEVE" as const),
  }));

  const canonicalSummary = summarizeSla(items);

  console.log("\nSummary Metrics (21 Aug 2026 - 20 Sep 2026):");
  console.log("Average SLA:", canonicalSummary.averageSla + "%");
  console.log("Total Paket Sampai:", canonicalSummary.totalPaketSampai);
  console.log("Sudah Tanda Terima:", canonicalSummary.sudahTandaTerima);
  console.log("Belum Tanda Terima:", canonicalSummary.belumTandaTerima);
  console.log("Lewat SLA:", canonicalSummary.lewatSla);
  console.log("Hari Achieve:", canonicalSummary.hariAchieve);
  console.log("Hari Not Achieve:", canonicalSummary.hariNotAchieve);
  console.log("Overall Status:", canonicalSummary.status);

  console.log("\nDaily Rows Ordering & Data:");
  for (const item of items) {
    console.log(`- Date: ${item.businessDate} | SLA: ${item.sla}% | Sampai: ${item.paketSampai} | Sudah: ${item.sudahTandaTerima} | Belum: ${item.belumTandaTerima} | Lewat: ${item.lewatSla} | Status: ${item.status}`);
  }

  console.log("\n=== BACKFILL COMPLETED SUCCESSFULLY ===");
}

main().catch(err => {
  console.error("Backfill failed:", err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
