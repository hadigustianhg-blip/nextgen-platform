import { createHash } from "node:crypto";
import argon2 from "argon2";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  assertCourierPaymentInvariant,
  assertInvoiceInvariant,
  assertSalaryInvariant,
  buildMasterSetoranAmounts,
} from "./seed-ui.helpers";

const prisma = new PrismaClient();
const TENANT_SLUG = "tenant-development";
const OUTLET_CODE = "DEV001";
const MARKER = "DEVUI";
const DAY_MS = 86_400_000;

function guardDevelopmentOnly() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("DEV UI seed refused: NODE_ENV=production.");
  }
  const environmentName = (
    process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.NEXTGEN_ENVIRONMENT ?? ""
  ).trim().toLowerCase();
  if (environmentName !== "development") {
    throw new Error("DEV UI seed refused: Railway/NEXTGEN environment must be explicitly development.");
  }
  if (process.env.ALLOW_DEV_UI_SEED !== "true") {
    throw new Error("DEV UI seed refused: set ALLOW_DEV_UI_SEED=true explicitly.");
  }
  if (process.env.DEV_UI_SEED_SCOPE !== `${TENANT_SLUG}:${OUTLET_CODE}`) {
    throw new Error(`DEV UI seed refused: set DEV_UI_SEED_SCOPE=${TENANT_SLUG}:${OUTLET_CODE} explicitly.`);
  }
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!databaseUrl) throw new Error("DEV UI seed refused: DATABASE_URL is missing.");
  const lowered = databaseUrl.toLowerCase();
  if (lowered.includes("production") || lowered.includes("prod.")) {
    throw new Error("DEV UI seed refused: DATABASE_URL appears to target production.");
  }
}

function id(seed: string) {
  const hex = createHash("sha256").update(`${MARKER}:${seed}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const dateOnly = (date: Date) => new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
const daysAgo = (anchor: Date, count: number) => dateOnly(new Date(anchor.getTime() - count * DAY_MS));
const atJakartaHour = (date: Date, hour: number, minute = 0) =>
  new Date(`${date.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+07:00`);

async function recoverInterruptedOperationalPhase(input: {
  tenantId: string;
  outletId: string;
}) {
  const scope = { tenantId: input.tenantId, outletId: input.outletId };
  const [partialPickups, partialDispatches, partialCodRecords, generatedSetoranCount] = await Promise.all([
    prisma.rawPickup.findMany({
      where: { ...scope, sourceEndpoint: "DEVUI_SYNTHETIC", sourceRecordKey: { startsWith: `${MARKER}:pickup:` } },
      select: { id: true, firstSeenRunId: true, lastSeenRunId: true, masterPickup: { select: { id: true } } },
    }),
    prisma.rawDispatch.findMany({
      where: { ...scope, sourceEndpoint: "DEVUI_SYNTHETIC", sourceRecordKey: { startsWith: `${MARKER}:dispatch:` } },
      select: { id: true, firstSeenRunId: true, lastSeenRunId: true },
    }),
    prisma.rawCod.findMany({
      where: { ...scope, sourceEndpoint: "DEVUI_SYNTHETIC", sourceRecordKey: { startsWith: `${MARKER}:cod:` } },
      select: { id: true, firstSeenRunId: true, lastSeenRunId: true },
    }),
    prisma.masterSetoran.count({ where: { ...scope, courierKey: { startsWith: `${MARKER}_` } } }),
  ]);
  if (partialPickups.length === 0 || generatedSetoranCount > 0) return;

  const rawPickupIds = partialPickups.map((row) => row.id);
  const masterPickupIds = partialPickups.flatMap((row) => row.masterPickup ? [row.masterPickup.id] : []);
  const syncRunIds = [...new Set([
    ...partialPickups.flatMap((row) => [row.firstSeenRunId, row.lastSeenRunId]),
    ...partialDispatches.flatMap((row) => [row.firstSeenRunId, row.lastSeenRunId]),
    ...partialCodRecords.flatMap((row) => [row.firstSeenRunId, row.lastSeenRunId]),
  ])];

  const [paymentCount, revisionCount, invoiceItemCount] = await Promise.all([
    prisma.pickupPayment.count({ where: { ...scope, masterPickupId: { in: masterPickupIds } } }),
    prisma.pickupSettlementRevision.count({ where: { ...scope, masterPickupId: { in: masterPickupIds } } }),
    prisma.invoiceItem.count({ where: { ...scope, masterPickupId: { in: masterPickupIds } } }),
  ]);
  if (paymentCount + revisionCount + invoiceItemCount > 0) {
    throw new Error("DEV UI recovery refused: interrupted pickup rows have downstream records; no cleanup was performed.");
  }

  await prisma.$transaction([
    prisma.masterPickup.deleteMany({ where: { ...scope, id: { in: masterPickupIds } } }),
    prisma.rawPickup.deleteMany({ where: { ...scope, id: { in: rawPickupIds }, sourceEndpoint: "DEVUI_SYNTHETIC" } }),
    prisma.rawDispatch.deleteMany({ where: { ...scope, id: { in: partialDispatches.map((row) => row.id) }, sourceEndpoint: "DEVUI_SYNTHETIC" } }),
    prisma.rawCod.deleteMany({ where: { ...scope, id: { in: partialCodRecords.map((row) => row.id) }, sourceEndpoint: "DEVUI_SYNTHETIC" } }),
    prisma.syncRun.deleteMany({ where: { ...scope, id: { in: syncRunIds } } }),
  ]);
  console.info(`Recovered interrupted ${MARKER} operational phase for ${TENANT_SLUG}/${OUTLET_CODE}.`);
}

async function main() {
  guardDevelopmentOnly();

  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) throw new Error(`DEV UI seed refused: tenant ${TENANT_SLUG} does not exist. Run the bootstrap seed first.`);
  const outlet = await prisma.outlet.findUnique({
    where: { tenantId_code: { tenantId: tenant.id, code: OUTLET_CODE } },
  });
  if (!outlet) throw new Error(`DEV UI seed refused: outlet ${OUTLET_CODE} does not exist in ${TENANT_SLUG}.`);

  const owner = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email: "owner@example.test" } },
  });
  if (!owner || owner.outletId !== outlet.id) {
    throw new Error("DEV UI seed refused: scoped development owner is missing or belongs to another outlet.");
  }

  const roles = await prisma.role.findMany({ where: { tenantId: tenant.id } });
  const roleByCode = new Map(roles.map((role) => [role.code, role.id]));
  if (!roleByCode.has("TEAM")) throw new Error("DEV UI seed refused: TEAM role is missing. Run the bootstrap seed first.");

  const anchor = dateOnly(new Date());
  const syntheticPasswordHash = await argon2.hash("DevUiSyntheticOnly!", { type: argon2.argon2id });
  const people = [
    ["Ahmad Pratama", "DRIVER"], ["Raka Saputra", "MOTORIST"],
    ["Dimas Maulana", "DRIVER"], ["Siti Rahma", "ADMIN"],
    ["Nadia Putri", "ADMIN_OPS"], ["Fajar Nugroho", "THREE_WHEEL_DRIVER"],
    ["Intan Lestari", "ADMIN"], ["Bima Kurniawan", "MOTORIST"],
    ["Rizky Hidayat", "DRIVER"], ["Maya Anggraini", "SALES"],
    ["Arif Setiawan", "MOTORIST"], ["Lina Oktaviani", "ADMIN_OPS"],
  ] as const;

  for (const [index, [name, division]] of people.entries()) {
    const userId = id(`user:${index}`);
    const employeeId = id(`employee:${index}`);
    await prisma.user.upsert({
      where: { id: userId },
      update: { name, outletId: outlet.id, status: "ACTIVE" },
      create: {
        id: userId, tenantId: tenant.id, outletId: outlet.id,
        email: `devui.team${String(index + 1).padStart(2, "0")}@example.test`,
        name, passwordHash: syntheticPasswordHash, status: "ACTIVE",
      },
    });
    await prisma.salaryEmployee.upsert({
      where: { id: employeeId },
      update: { name, division, status: index === 11 ? "INACTIVE" : "ACTIVE" },
      create: {
        id: employeeId, tenantId: tenant.id, outletId: outlet.id, name, division,
        whatsapp: `+62800000${String(index + 1).padStart(4, "0")}`,
        status: index === 11 ? "INACTIVE" : "ACTIVE",
      },
    });
    await prisma.teamMembership.upsert({
      where: { id: id(`membership:${index}`) },
      update: { status: index === 11 ? "INACTIVE" : "ACTIVE" },
      create: {
        id: id(`membership:${index}`), tenantId: tenant.id, outletId: outlet.id,
        userId, salaryEmployeeId: employeeId,
        status: index === 11 ? "INACTIVE" : "ACTIVE", effectiveFrom: daysAgo(anchor, 120),
      },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: roleByCode.get("TEAM")! } },
      update: {}, create: { userId, roleId: roleByCode.get("TEAM")! },
    });
  }

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      name: "Tenant Development", email: "operasional@example.test",
      phone: "+6280000000100", adminWhatsapp: "+6280000000101",
      address: "Jalan Contoh Digital No. 1, Kota Uji, Indonesia",
    },
  });
  await prisma.outlet.update({
    where: { id: outlet.id },
    data: {
      name: "Development Outlet DEV001", email: "dev001@example.test",
      phone: "+6280000000200", adminWhatsapp: "+6280000000201",
      address: "Kompleks Operasional Synthetic Blok DEV-01, Kota Uji",
    },
  });

  await prisma.operationalTargetSetting.upsert({
    where: { tenantId_outletId: { tenantId: tenant.id, outletId: outlet.id } },
    update: { achievementDeliveryTarget: 95, pendingMaximum: 12, slaTarget: 96, pickupRevenueTarget: 25_000_000, pickupWeightTarget: 2_500, waybillStuckMaximum: 8, updatedByUserId: owner.id },
    create: { tenantId: tenant.id, outletId: outlet.id, achievementDeliveryTarget: 95, pendingMaximum: 12, slaTarget: 96, pickupRevenueTarget: 25_000_000, pickupWeightTarget: 2_500, waybillStuckMaximum: 8, updatedByUserId: owner.id },
  });
  await prisma.attendanceLocationSetting.upsert({
    where: { outletId: outlet.id },
    update: { latitude: -6.2, longitude: 106.816667, radiusMeters: 150, isActive: true, updatedByUserId: owner.id },
    create: { id: id("attendance-location"), tenantId: tenant.id, outletId: outlet.id, latitude: -6.2, longitude: 106.816667, radiusMeters: 150, isActive: true, updatedByUserId: owner.id },
  });

  const categories = [
    ["INCOME", "Pendapatan Pickup"], ["INCOME", "Pendapatan Delivery"],
    ["EXPENSE", "Bahan Bakar"], ["EXPENSE", "Operasional Outlet"],
    ["EXPENSE", "Kasbon Team"], ["EXPENSE", "Perawatan Kendaraan"],
  ] as const;
  for (const [index, [type, name]] of categories.entries()) {
    await prisma.financialCategory.upsert({
      where: { tenantId_outletId_type_canonicalName: { tenantId: tenant.id, outletId: outlet.id, type, canonicalName: name.toLocaleLowerCase("id-ID") } },
      update: { name, isActive: true, sortOrder: index },
      create: { id: id(`category:${index}`), tenantId: tenant.id, outletId: outlet.id, type, name, canonicalName: name.toLocaleLowerCase("id-ID"), sortOrder: index },
    });
  }
  const banks = [["Bank Contoh Indonesia", "000000000001", true], ["Bank Digital Uji", "000000000002", false]] as const;
  for (const [index, [bankName, accountNumber, isDefault]] of banks.entries()) {
    await prisma.outletBankAccount.upsert({
      where: { id: id(`bank:${index}`) },
      update: { bankName, accountNumber, accountHolder: "NEXTGEN DEVELOPMENT", isDefault, isActive: true },
      create: { id: id(`bank:${index}`), tenantId: tenant.id, outletId: outlet.id, bankName, accountNumber, accountHolder: "NEXTGEN DEVELOPMENT", displayOrder: index, isDefault },
    });
  }

  const syncRuns: Prisma.SyncRunCreateManyInput[] = [];
  const pickups: Prisma.RawPickupCreateManyInput[] = [];
  const masters: Prisma.MasterPickupCreateManyInput[] = [];
  const dispatches: Prisma.RawDispatchCreateManyInput[] = [];
  const codRecords: Prisma.RawCodCreateManyInput[] = [];
  const setoran: Prisma.MasterSetoranCreateManyInput[] = [];
  const slaRows: Prisma.RawSlaCutOffCreateManyInput[] = [];
  const inventoryRows: Prisma.RawInventoryDetailCreateManyInput[] = [];
  const statusRows: Prisma.RawWaybillStatusCreateManyInput[] = [];
  const schedules: Prisma.RawPickupScheduleCreateManyInput[] = [];

  for (let day = 59; day >= 0; day -= 1) {
    const businessDate = daysAgo(anchor, day);
    const dateKey = businessDate.toISOString().slice(0, 10);
    const runId = id(`sync:${dateKey}`);
    const pickupCount = day % 13 === 0 ? 0 : 18 + (day * 7) % 28;
    const dispatchCount = day % 17 === 0 ? 18 : 55 + (day * 13) % 70;
    const codCount = Math.floor(dispatchCount * 0.38);
    syncRuns.push({
      id: runId, tenantId: tenant.id, outletId: outlet.id, runType: day % 5 === 0 ? "FULL" : "PICKUP",
      operationalDate: businessDate, status: day % 19 === 0 ? "PARTIAL_SUCCESS" : "SUCCESS",
      startedAt: atJakartaHour(businessDate, 20), completedAt: atJakartaHour(businessDate, 20, 8), triggeredByUserId: owner.id,
      pickupFetchedCount: pickupCount, pickupCreatedCount: pickupCount, dispatchFetchedCount: dispatchCount,
      dispatchCreatedCount: dispatchCount, codFetchedCount: codCount, codCreatedCount: codCount,
      anomalyCount: day % 19 === 0 ? 2 : 0, metadata: { marker: MARKER, scenario: "NORMAL" },
    });

    for (let index = 0; index < pickupCount; index += 1) {
      const waybill = `DEVUI-P-${dateKey.replaceAll("-", "")}-${String(index).padStart(4, "0")}`;
      const rawId = id(`pickup:${waybill}`);
      const freight = 15_000 + ((index + day) % 18) * 2_500;
      const payload = { marker: MARKER, waybillNo: waybill, synthetic: true };
      pickups.push({
        id: rawId, tenantId: tenant.id, outletId: outlet.id, operationalDate: businessDate,
        sourceEndpoint: "DEVUI_SYNTHETIC", sourceRecordKey: `${MARKER}:pickup:${waybill}`,
        sourceFetchedAt: atJakartaHour(businessDate, 20), syncedAt: atJakartaHour(businessDate, 20, 8), syncStatus: "NORMALIZED",
        sourceRecordHash: hash(payload), sourcePayload: payload, firstSeenRunId: runId, lastSeenRunId: runId,
        waybillNo: waybill, pickNetwork: OUTLET_CODE, destination: ["Kota Uji", "Kabupaten Contoh", "Wilayah Demo"][index % 3],
        settlementRaw: index % 4 === 0 ? "MARKETPLACE" : "REGULAR", totalFreight: freight, freight,
        weight: 0.5 + (index % 12) * 0.35, staffNameRaw: people[index % people.length]![0],
        senderName: ["PT Contoh Nusantara", "Toko Maju Bersama", "CV Sinar Abadi", "Gerai Synthetic Indonesia"][index % 4],
        serviceRaw: index % 3 === 0 ? "EZ" : "REG", receiverName: `Penerima Synthetic ${index + 1}`,
        receiverAddress: `Jalan Data Uji Blok ${index % 20 + 1}, Kota Contoh`,
      });
      masters.push({
        id: id(`master-pickup:${waybill}`), tenantId: tenant.id, outletId: outlet.id, rawPickupId: rawId,
        operationalDate: businessDate, waybillNo: waybill, staffName: people[index % people.length]![0],
        senderName: ["PT Contoh Nusantara", "Toko Maju Bersama", "CV Sinar Abadi", "Gerai Synthetic Indonesia"][index % 4],
        freightAmount: freight, syncStatus: "NORMALIZED", sourceSyncedAt: atJakartaHour(businessDate, 20, 8),
      });
    }

    for (let index = 0; index < dispatchCount; index += 1) {
      const waybill = `DEVUI-D-${dateKey.replaceAll("-", "")}-${String(index).padStart(4, "0")}`;
      const courier = people[index % 7]![0];
      const freight = 18_000 + ((index + day) % 24) * 2_000;
      const isPending = index % 19 === 0;
      const payload = { marker: MARKER, waybillNo: waybill, synthetic: true };
      dispatches.push({
        id: id(`dispatch:${waybill}`), tenantId: tenant.id, outletId: outlet.id, operationalDate: businessDate,
        sourceEndpoint: "DEVUI_SYNTHETIC", sourceRecordKey: `${MARKER}:dispatch:${waybill}`,
        sourceFetchedAt: atJakartaHour(businessDate, 20), syncedAt: atJakartaHour(businessDate, 20, 8), syncStatus: "NORMALIZED",
        sourceRecordHash: hash(payload), sourcePayload: payload, firstSeenRunId: runId, lastSeenRunId: runId,
        waybillNo: waybill, courierNameRaw: courier, freightAmount: freight,
        dispatchTimeRaw: atJakartaHour(businessDate, 9, index % 60).toISOString(), dispatchAt: atJakartaHour(businessDate, 9, index % 60),
        receiverName: `Penerima Delivery Synthetic ${index + 1}`, receiverAddress: `Jalan Pengujian No. ${index + 1}, Kota Uji`,
        deliveryStatusRaw: isPending ? "Dalam Pengantaran" : "Penerimaan Normal", chargeWeight: 0.8 + index % 15,
        settlementTypeRaw: index % 3 === 0 ? "COD" : "DFOD", serviceRaw: "REG",
        codStatusRaw: index < codCount ? (index % 5 === 0 ? "Belum Setor" : "Sudah Setor") : "NON COD",
        codValue: index < codCount ? 45_000 + (index % 15) * 10_000 : 0, goodsDescription: `Barang synthetic kategori ${index % 6 + 1}`,
      });
      if (index < codCount) {
        codRecords.push({
          id: id(`cod:${waybill}`), tenantId: tenant.id, outletId: outlet.id, operationalDate: businessDate,
          sourceEndpoint: "DEVUI_SYNTHETIC", sourceRecordKey: `${MARKER}:cod:${waybill}`,
          sourceFetchedAt: atJakartaHour(businessDate, 20), syncedAt: atJakartaHour(businessDate, 20, 8), syncStatus: "NORMALIZED",
          sourceRecordHash: hash({ ...payload, kind: "COD" }), sourcePayload: { ...payload, kind: "COD" }, firstSeenRunId: runId, lastSeenRunId: runId,
          waybillNo: waybill, codAmount: 45_000 + (index % 15) * 10_000,
          repaymentStatusRaw: { code: index % 5 === 0 ? 0 : 1 }, repaymentStatusCode: index % 5 === 0 ? 0 : 1,
          repaymentTypeRaw: { label: index % 4 === 0 ? "QRIS" : "CASH" }, repaymentTypeCode: index % 4 === 0 ? 2 : 1,
          repaymentTypeLabel: index % 4 === 0 ? "QRIS" : "CASH", signTimeRaw: atJakartaHour(businessDate, 17).toISOString(),
          signedAt: atJakartaHour(businessDate, 17), courierNameRaw: courier,
        });
      }
    }

    for (let courierIndex = 0; courierIndex < 7; courierIndex += 1) {
      const obligation = 450_000 + (courierIndex * 75_000) + (day % 5) * 25_000;
      const amounts = buildMasterSetoranAmounts(obligation);
      setoran.push({
        id: id(`setoran:${dateKey}:${courierIndex}`), tenantId: tenant.id, outletId: outlet.id,
        operationalDate: businessDate, courierKey: `${MARKER}_COURIER_${courierIndex}`, courierName: people[courierIndex]![0],
        ...amounts, needsReview: day % 11 === 0 && courierIndex === 0,
        syncStatus: "NORMALIZED", sourceFetchedFrom: atJakartaHour(businessDate, 8), sourceFetchedTo: atJakartaHour(businessDate, 20),
      });
    }

    const arrived = 70 + day % 35;
    const signed = Math.max(0, arrived - (day % 9));
    slaRows.push({
      id: id(`sla:${dateKey}`), tenantId: tenant.id, outletId: outlet.id, businessDate,
      sourceEndpoint: "DEVUI_SYNTHETIC", sourceRecordKey: `${MARKER}:sla:${dateKey}`,
      sourceFetchedAt: atJakartaHour(businessDate, 20), syncStatus: "NORMALIZED",
      sourcePayload: { marker: MARKER, synthetic: true }, sla: signed / arrived * 100,
      paketSampai: arrived, sudahTandaTerima: signed, belumTandaTerima: arrived - signed, lewatSla: day % 9,
    });

    const problemCount = day % 10 === 0 ? 8 : 2 + day % 4;
    for (let index = 0; index < problemCount; index += 1) {
      const bill = `DEVUI-W-${dateKey.replaceAll("-", "")}-${String(index).padStart(3, "0")}`;
      inventoryRows.push({
        id: id(`inventory:${bill}`), tenantId: tenant.id, outletId: outlet.id, businessDate,
        billCode: bill, customerName: `Customer Synthetic ${index + 1}`, goodsName: `Paket Uji ${index + 1}`,
        inventoryHours: 18 + index * 7, operateScanTime2: atJakartaHour(businessDate, 10).toISOString(),
        destinationDistributionName: "Distribution Center Synthetic", expressTypeName: "REG",
        sourceRecordKey: `${MARKER}:inventory:${bill}`, sourceHash: hash(bill), syncedAt: atJakartaHour(businessDate, 20),
      });
      statusRows.push({
        id: id(`status:${bill}`), tenantId: tenant.id, outletId: outlet.id, businessDate, sourceWaybill: bill,
        currentScanSite: OUTLET_CODE, currentScanTime: atJakartaHour(businessDate, 12).toISOString(),
        currentScanType: index % 3 === 0 ? "Problem" : "Transit", scanType: "Delivery",
        problemReason: index % 3 === 0 ? "Alamat synthetic memerlukan konfirmasi" : null,
        isVoid: "0", statusFound: index % 7 !== 0, sourceRecordKey: `${MARKER}:status:${bill}`,
        sourceHash: hash({ bill, index }), syncedAt: atJakartaHour(businessDate, 20),
      });
    }
    for (let index = 0; index < 12 + day % 15; index += 1) {
      const order = `${MARKER}-ORDER-${dateKey.replaceAll("-", "")}-${String(index).padStart(3, "0")}`;
      schedules.push({
        id: id(`schedule:${order}`), tenantId: tenant.id, outletId: outlet.id, businessDate,
        sourceOrderId: order, waybillNo: `DEVUI-S-${dateKey.replaceAll("-", "")}-${String(index).padStart(3, "0")}`,
        customerId: `${MARKER}-CUSTOMER-${index % 8}`, senderNameMasked: `Pengirim Synthetic ${index % 8 + 1}`,
        senderPhoneMasked: "+62800****0000", pickupAddressMasked: `Alamat synthetic area ${index % 6 + 1}`,
        sourcePlatform: index % 2 === 0 ? "MARKETPLACE_TEST" : "DIRECT_TEST", goodsName: `Produk Synthetic ${index % 7 + 1}`,
        weight: 0.5 + index % 8, sourceStatus: ["PENDING", "ASSIGNED", "COMPLETED"][index % 3],
        sourceOutletCode: OUTLET_CODE, sourceNetworkCode: OUTLET_CODE, sourceInputTime: atJakartaHour(businessDate, 8).toISOString(),
        sourceUpdatedTime: atJakartaHour(businessDate, 11).toISOString(), sourceRecordKey: `${MARKER}:schedule:${order}`,
        sourceHash: hash(order), syncedAt: atJakartaHour(businessDate, 20),
      });
    }
  }

  await recoverInterruptedOperationalPhase({
    tenantId: tenant.id,
    outletId: outlet.id,
  });
  // Keep the high-volume operational phase atomic without holding one transaction
  // across identity, attendance, finance, invoice, and salary generation.
  await prisma.$transaction([
    prisma.syncRun.createMany({ data: syncRuns, skipDuplicates: true }),
    prisma.rawPickup.createMany({ data: pickups, skipDuplicates: true }),
    prisma.masterPickup.createMany({ data: masters, skipDuplicates: true }),
    prisma.rawDispatch.createMany({ data: dispatches, skipDuplicates: true }),
    prisma.rawCod.createMany({ data: codRecords, skipDuplicates: true }),
    prisma.masterSetoran.createMany({ data: setoran, skipDuplicates: true }),
    prisma.rawSlaCutOff.createMany({ data: slaRows, skipDuplicates: true }),
    prisma.rawInventoryDetail.createMany({ data: inventoryRows, skipDuplicates: true }),
    prisma.rawWaybillStatus.createMany({ data: statusRows, skipDuplicates: true }),
    prisma.rawPickupSchedule.createMany({ data: schedules, skipDuplicates: true }),
  ]);

  const settlementRevisions: Prisma.PickupSettlementRevisionCreateManyInput[] = [];
  const pickupPayments: Prisma.PickupPaymentCreateManyInput[] = [];
  for (const [index, master] of masters.filter((_, itemIndex) => itemIndex % 4 === 0).slice(0, 360).entries()) {
    const masterDate = new Date(master.operationalDate);
    const transactionKey = id(`pickup-payment-transaction:${master.id}`);
    settlementRevisions.push({
      id: id(`pickup-revision:${master.id}`), tenantId: tenant.id, outletId: outlet.id,
      masterPickupId: master.id!, requestKey: id(`pickup-revision-request:${master.id}`), revision: 1,
      recordStatus: index % 23 === 0 ? "VOID" : "VALID", discountAmount: index % 5 === 0 ? 5_000 : 0,
      reason: index % 5 === 0 ? `${MARKER} diskon synthetic` : null,
      voidedAt: index % 23 === 0 ? atJakartaHour(masterDate, 18) : null,
      voidedByUserId: index % 23 === 0 ? owner.id : null,
      voidReason: index % 23 === 0 ? `${MARKER} void scenario` : null,
      createdByUserId: owner.id, updatedByUserId: owner.id,
    });
    if (index % 4 !== 0) {
      pickupPayments.push({
        id: id(`pickup-payment:${master.id}`), tenantId: tenant.id, outletId: outlet.id,
        masterPickupId: master.id!, transactionKey, revision: 1,
        recordStatus: index % 29 === 0 ? "VOID" : "VALID",
        paymentDate: new Date(masterDate.getTime() + DAY_MS),
        receivedAmount: Number(master.freightAmount) - (index % 7 === 0 ? 5_000 : 0),
        paymentMethodRaw: index % 3 === 0 ? "TRANSFER" : "CASH",
        transferAccount: index % 3 === 0 ? "000000000001" : null,
        reference: `${MARKER}-PICKPAY-${index}`, note: index % 7 === 0 ? "Pembayaran partial synthetic" : "Pembayaran synthetic",
        voidedAt: index % 29 === 0 ? atJakartaHour(masterDate, 19) : null,
        voidedByUserId: index % 29 === 0 ? owner.id : null,
        voidReason: index % 29 === 0 ? `${MARKER} void payment scenario` : null,
        createdByUserId: owner.id, updatedByUserId: owner.id,
      });
    }
  }
  await prisma.pickupSettlementRevision.createMany({ data: settlementRevisions, skipDuplicates: true });
  await prisma.pickupPayment.createMany({ data: pickupPayments, skipDuplicates: true });

  const courierPayments: Prisma.CourierSettlementPaymentCreateManyInput[] = [];
  const courierTransfers: Prisma.CourierSettlementTransferCreateManyInput[] = [];
  for (const [index, item] of setoran.filter((_, itemIndex) => itemIndex % 5 === 0).entries()) {
    const settlementDate = new Date(item.operationalDate);
    const paymentId = id(`courier-payment:${item.id}`);
    const transactionKey = id(`courier-payment-transaction:${item.id}`);
    const paidRatio = index % 6 === 0 ? 0.65 : index % 7 === 0 ? 1.08 : 1;
    const paid = Math.round(Number(item.totalSettlementAmount) * paidRatio);
    const transfer = index % 3 === 0 ? Math.round(paid * 0.55) : 0;
    assertCourierPaymentInvariant({ cashAmount: paid - transfer, transferAmountSnapshot: transfer, paidAmountSnapshot: paid });
    courierPayments.push({
      id: paymentId, tenantId: tenant.id, outletId: outlet.id, masterSetoranId: item.id!,
      transactionKey, revision: 1, recordStatus: index % 31 === 0 ? "VOID" : "VALID",
      paymentDate: new Date(settlementDate.getTime() + DAY_MS), cashAmount: paid - transfer,
      transferAmountSnapshot: transfer, paidAmountSnapshot: paid,
      note: paidRatio < 1 ? "Pembayaran pending/partial synthetic" : paidRatio > 1 ? "Overpayment synthetic" : "Pembayaran lunas synthetic",
      overpaymentConfirmedAt: paidRatio > 1 ? atJakartaHour(settlementDate, 20) : null,
      overpaymentConfirmedByUserId: paidRatio > 1 ? owner.id : null,
      voidedAt: index % 31 === 0 ? atJakartaHour(settlementDate, 21) : null,
      voidedByUserId: index % 31 === 0 ? owner.id : null,
      voidReason: index % 31 === 0 ? `${MARKER} void settlement` : null,
      createdByUserId: owner.id, updatedByUserId: owner.id,
    });
    if (transfer > 0) {
      courierTransfers.push({
        id: id(`courier-transfer:${item.id}`), tenantId: tenant.id, outletId: outlet.id,
        settlementPaymentId: paymentId, transactionKey: id(`courier-transfer-transaction:${item.id}`), sequence: 1, revision: 1,
        amount: transfer, destinationAccount: "000000000001", bankName: "Bank Contoh Indonesia",
        referenceNumber: `${MARKER}-TRF-${index}`, transferredAt: atJakartaHour(settlementDate, 18),
        note: "Transfer settlement synthetic", createdByUserId: owner.id, updatedByUserId: owner.id,
      });
    }
  }
  await prisma.courierSettlementPayment.createMany({ data: courierPayments, skipDuplicates: true });
  await prisma.courierSettlementTransfer.createMany({ data: courierTransfers, skipDuplicates: true });

  const attendanceRows: Prisma.AttendanceRecordCreateManyInput[] = [];
  const attendanceEvents: Prisma.AttendanceEventCreateManyInput[] = [];
  for (let day = 44; day >= 0; day -= 1) {
    const businessDate = daysAgo(anchor, day);
    if ([0, 6].includes(businessDate.getUTCDay())) continue;
    for (let index = 0; index < 11; index += 1) {
      const recordId = id(`attendance:${businessDate.toISOString().slice(0, 10)}:${index}`);
      const status = (day + index) % 29 === 0 ? "ABSENT" : (day + index) % 17 === 0 ? "SICK" : (day + index) % 13 === 0 ? "LEAVE" : (day + index) % 7 === 0 ? "LATE" : "PRESENT";
      const checked = status === "PRESENT" || status === "LATE";
      attendanceRows.push({
        id: recordId, tenantId: tenant.id, outletId: outlet.id, salaryEmployeeId: id(`employee:${index}`),
        businessDate, status, checkInAt: checked ? atJakartaHour(businessDate, status === "LATE" ? 9 : 8, status === "LATE" ? 12 : index % 20) : null,
        checkOutAt: checked ? atJakartaHour(businessDate, 17, index % 30) : null,
      });
      if (checked) {
        for (const [eventIndex, eventType] of (["CLOCK_IN", "CLOCK_OUT"] as const).entries()) {
          attendanceEvents.push({
            id: id(`attendance-event:${recordId}:${eventType}`), tenantId: tenant.id, outletId: outlet.id,
            attendanceRecordId: recordId, salaryEmployeeId: id(`employee:${index}`), eventType,
            occurredAt: eventIndex === 0 ? atJakartaHour(businessDate, status === "LATE" ? 9 : 8, index % 20) : atJakartaHour(businessDate, 17, index % 30),
            latitude: -6.2, longitude: 106.816667, accuracyMeters: 8 + index,
            distanceFromOutletMeters: 20 + index * 3, withinRadius: true, actorUserId: id(`user:${index}`),
            idempotencyKey: `${MARKER}:${recordId}:${eventType}`,
          });
        }
      }
    }
  }
  await prisma.attendanceRecord.createMany({ data: attendanceRows, skipDuplicates: true });
  await prisma.attendanceEvent.createMany({ data: attendanceEvents, skipDuplicates: true });

  const leaveStatuses = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
  const leaveTypes = ["LEAVE", "SICK", "PERMISSION"] as const;
  for (let index = 0; index < 12; index += 1) {
    const leaveId = id(`leave:${index}`);
    const status = leaveStatuses[index % leaveStatuses.length];
    await prisma.leaveRequest.upsert({
      where: { id: leaveId }, update: { status },
      create: {
        id: leaveId, tenantId: tenant.id, outletId: outlet.id, salaryEmployeeId: id(`employee:${index % 11}`),
        type: leaveTypes[index % leaveTypes.length], startDate: daysAgo(anchor, 35 - index * 2), endDate: daysAgo(anchor, 35 - index * 2 - (index % 2)),
        reason: `Keperluan synthetic untuk pengujian UI nomor ${index + 1}.`, status,
        reviewedAt: status === "APPROVED" || status === "REJECTED" ? daysAgo(anchor, 30 - index) : null,
        reviewedByUserId: status === "APPROVED" || status === "REJECTED" ? owner.id : null,
        reviewNotes: status === "REJECTED" ? "Ditolak untuk demonstrasi variasi status." : status === "APPROVED" ? "Disetujui untuk demonstrasi." : null,
      },
    });
  }

  const expenseRows: Prisma.OperationalExpenseCreateManyInput[] = [];
  const closingRows: Prisma.OperationalClosingCreateManyInput[] = [];
  const movementRows: Prisma.CashMovementCreateManyInput[] = [];
  for (let day = 59; day >= 0; day -= 1) {
    const businessDate = daysAgo(anchor, day);
    const key = businessDate.toISOString().slice(0, 10);
    for (let index = 0; index < 3; index += 1) {
      expenseRows.push({
        id: id(`expense:${key}:${index}`), tenantId: tenant.id, outletId: outlet.id, operationalDate: businessDate,
        category: ["Bahan Bakar", "Operasional Outlet", "Kasbon Team"][index]!, amount: 75_000 + (day % 8) * 15_000 + index * 50_000,
        description: `${MARKER} biaya synthetic ${index + 1}`, teamName: index === 2 ? people[day % 10]![0] : null,
        cashAdvanceCategory: index === 2 ? "Kasbon Karyawan" : null, vehiclePlate: index === 0 ? `DEV-${1000 + day}` : null,
        status: day % 23 === 0 && index === 1 ? "VOID" : "VALID", createdByUserId: owner.id, updatedByUserId: owner.id,
      });
    }
    const collected = 3_500_000 + day % 9 * 250_000;
    const expense = 500_000 + day % 8 * 45_000;
    const variance = day % 14 === 0 ? 50_000 : 0;
    closingRows.push({
      id: id(`closing:${key}`), tenantId: tenant.id, outletId: outlet.id, operationalDate: businessDate,
      snapshotVersion: 1, cashCollectedSnapshot: collected * 0.7, transferCollectedSnapshot: collected * 0.3,
      outstandingSnapshot: day % 6 * 100_000, operationalExpenseSnapshot: expense,
      cashAvailableBeforeDepositSnapshot: collected - expense, bankDepositAmount: collected - expense - 250_000,
      bankDepositAccount: "000000000001", bankDepositReference: `${MARKER}-DEP-${key}`,
      remainingCashAfterDepositSnapshot: 250_000, physicalCash: 250_000 + variance, cashVariance: variance,
      varianceStatus: variance ? "MISMATCH" : "MATCH", status: day < 2 ? "OPEN" : "CLOSED",
      closedByUserId: day < 2 ? null : owner.id, closedAt: day < 2 ? null : atJakartaHour(businessDate, 21),
    });
    for (let index = 0; index < 4; index += 1) {
      movementRows.push({
        id: id(`movement:${key}:${index}`), tenantId: tenant.id, outletId: outlet.id, businessDate,
        occurredAt: atJakartaHour(businessDate, 10 + index), direction: index < 2 ? "IN" : "OUT",
        channel: index % 2 === 0 ? "CASH" : "BANK",
        movementType: index === 0 ? "DELIVERY_PAYMENT" : index === 1 ? "PICKUP_PAYMENT" : index === 2 ? "OPERATIONAL_EXPENSE" : "BANK_DEPOSIT",
        amount: 250_000 + (day % 7) * 50_000 + index * 25_000, description: `${MARKER} cash movement synthetic`,
        reference: `${MARKER}-MOV-${key}-${index}`, sourceType: `${MARKER}_SYNTHETIC`, sourceId: id(`movement-source:${key}:${index}`),
        requestKey: id(`movement-request:${key}:${index}`), recordStatus: day % 29 === 0 && index === 3 ? "VOID" : "VALID", createdByUserId: owner.id,
      });
    }
  }
  await prisma.operationalExpense.createMany({ data: expenseRows, skipDuplicates: true });
  await prisma.operationalClosing.createMany({ data: closingRows, skipDuplicates: true });
  await prisma.cashMovement.createMany({ data: movementRows, skipDuplicates: true });

  const cashflowRuns: Prisma.JfsCashflowSyncRunCreateManyInput[] = [];
  const cashflowRecords: Prisma.JfsCashflowRecordCreateManyInput[] = [];
  for (let day = 59; day >= 0; day -= 1) {
    const businessDate = daysAgo(anchor, day);
    const key = businessDate.toISOString().slice(0, 10);
    const runId = id(`cashflow-run:${key}`);
    cashflowRuns.push({
      id: runId, tenantId: tenant.id, outletId: outlet.id, periodStart: businessDate, periodEnd: businessDate,
      triggerSource: "MANUAL", status: day % 21 === 0 ? "PARTIAL_SUCCESS" : "SUCCESS",
      fetchedCount: 4, uniqueCount: 4, createdCount: 4, anomalyCount: day % 21 === 0 ? 1 : 0,
      startedAt: atJakartaHour(businessDate, 21), completedAt: atJakartaHour(businessDate, 21, 2), requestId: `${MARKER}-CF-${key}`,
    });
    for (let index = 0; index < 4; index += 1) {
      const amount = 350_000 + day % 10 * 50_000 + index * 75_000;
      cashflowRecords.push({
        id: id(`cashflow:${key}:${index}`), tenantId: tenant.id, outletId: outlet.id, businessDate,
        direction: index < 2 ? "INCOME" : "EXPENSE", transactionType: index < 2 ? "DELIVERY_REVENUE" : "OPERATIONAL_COST",
        category: index < 2 ? "Pendapatan JFS Synthetic" : index === 2 ? "Bahan Bakar" : "Operasional Outlet",
        amount, sourceReference: `${MARKER}-CF-REF-${key}-${index}`, sourceRecordKey: `${MARKER}:cashflow:${key}:${index}`,
        sourcePayloadHash: hash({ key, index, amount }), firstSeenRunId: runId, lastSeenRunId: runId, fetchedAt: atJakartaHour(businessDate, 21),
      });
    }
  }
  await prisma.jfsCashflowSyncRun.createMany({ data: cashflowRuns, skipDuplicates: true });
  await prisma.jfsCashflowRecord.createMany({ data: cashflowRecords, skipDuplicates: true });

  const profileSpecs = [
    ["DEVUI-COURIER", "Profil Kurir Synthetic", "DRIVER"],
    ["DEVUI-STAFF", "Profil Staff Synthetic", "ADMIN_OPS"],
  ] as const;
  for (const [index, [code, name, division]] of profileSpecs.entries()) {
    const profileId = id(`salary-profile:${index}`);
    await prisma.salaryProfile.upsert({
      where: { id: profileId }, update: { name, status: "ACTIVE" },
      create: { id: profileId, tenantId: tenant.id, outletId: outlet.id, code, name, division, description: `${MARKER} profile`, effectiveFrom: daysAgo(anchor, 365), status: "ACTIVE", createdByUserId: owner.id },
    });
    await prisma.salaryProfileSetting.upsert({
      where: { salaryProfileId: profileId },
      update: { basicDailySalary: index === 0 ? 125_000 : 150_000, overtimeRate: 20_000, fixedAllowance: 300_000 },
      create: { id: id(`salary-setting:${index}`), tenantId: tenant.id, outletId: outlet.id, salaryProfileId: profileId, basicDailySalary: index === 0 ? 125_000 : 150_000, overtimeRate: 20_000, fixedAllowance: 300_000, deliveryPerWaybillAmount: index === 0 ? 1_500 : null, dailyFuelMinDeliveryWaybill: index === 0 ? 40 : null, dailyFuelAmount: index === 0 ? 35_000 : null },
    });
  }
  for (let index = 0; index < 11; index += 1) {
    const profileId = id(`salary-profile:${index < 7 ? 0 : 1}`);
    await prisma.employeeSalaryAssignment.upsert({
      where: { id: id(`salary-assignment:${index}`) }, update: { status: "ACTIVE", salaryProfileId: profileId },
      create: { id: id(`salary-assignment:${index}`), tenantId: tenant.id, outletId: outlet.id, employeeId: id(`employee:${index}`), salaryProfileId: profileId, effectiveFrom: daysAgo(anchor, 365), status: "ACTIVE", createdByUserId: owner.id },
    });
  }

  for (let monthOffset = 1; monthOffset >= 0; monthOffset -= 1) {
    const ref = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - monthOffset, 1));
    const periodStart = dateOnly(ref);
    const periodEnd = dateOnly(new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0)));
    const monthKey = `${ref.getUTCFullYear()}-${String(ref.getUTCMonth() + 1).padStart(2, "0")}`;
    const closingId = id(`salary-closing:${monthKey}`);
    await prisma.salaryClosing.upsert({
      where: { id: closingId }, update: { status: monthOffset === 0 ? "DRAFT" : "CLOSED" },
      create: {
        id: closingId, tenantId: tenant.id, outletId: outlet.id, closingNumber: `${MARKER}-SAL-${monthKey}`,
        periodStart, periodEnd, status: monthOffset === 0 ? "DRAFT" : "CLOSED", notes: `${MARKER} salary closing synthetic`,
        createdByUserId: owner.id, closedByUserId: monthOffset === 0 ? null : owner.id,
        closedAt: monthOffset === 0 ? null : atJakartaHour(periodEnd, 20), generatedAt: atJakartaHour(periodEnd, 19),
      },
    });
    for (let index = 0; index < 11; index += 1) {
      const closingEmployeeId = id(`salary-closing-employee:${monthKey}:${index}`);
      const base = 3_000_000 + index * 125_000;
      const addition = 300_000;
      const deduction = (index % 3) * 100_000;
      const netSalary = base + addition - deduction;
      assertSalaryInvariant({ systemIncomeTotal: base, manualAdditionTotal: addition, manualDeductionTotal: deduction, netSalary });
      await prisma.salaryClosingEmployee.upsert({
        where: { id: closingEmployeeId }, update: { netSalary },
        create: {
          id: closingEmployeeId, tenantId: tenant.id, outletId: outlet.id, salaryClosingId: closingId,
          employeeId: id(`employee:${index}`), employeeNameSnapshot: people[index]![0], divisionSnapshot: people[index]![1],
          whatsappSnapshot: `+62800000${String(index + 1).padStart(4, "0")}`,
          salaryProfileId: id(`salary-profile:${index < 7 ? 0 : 1}`), salaryProfileCodeSnapshot: index < 7 ? "DEVUI-COURIER" : "DEVUI-STAFF",
          salaryProfileVersionSnapshot: 1, systemIncomeTotal: base, manualAdditionTotal: addition,
          manualDeductionTotal: deduction, netSalary,
          status: monthOffset === 0 ? "DRAFT" : "PROCESSED", workDayCount: 22 - index % 4,
          sourcePickupCount: 20 + index, sourceDispatchCount: 80 + index * 3, calculationWarningCount: index % 7 === 0 ? 1 : 0,
          generatedAt: atJakartaHour(periodEnd, 19),
        },
      });
      await prisma.salaryClosingComponent.upsert({
        where: { id: id(`salary-component:${monthKey}:${index}`) }, update: { amount: base },
        create: {
          id: id(`salary-component:${monthKey}:${index}`), tenantId: tenant.id, outletId: outlet.id,
          salaryClosingEmployeeId: closingEmployeeId, componentCode: "DEVUI-BASE", componentName: "Pendapatan Synthetic",
          componentType: "INCOME", sourceType: "BASIC", quantity: 1, rate: base, amount: base,
          metadata: { marker: MARKER },
        },
      });
    }
  }

  const invoiceStatuses = ["DRAFT", "ISSUED", "SENT", "PAID", "PARTIALLY_PAID"] as const;
  const invoicePickups = masters.filter((_, index) => index % 47 === 0).slice(0, 40);
  for (let index = 0; index < 20; index += 1) {
    const invoiceId = id(`invoice:${index}`);
    const status = invoiceStatuses[index % invoiceStatuses.length];
    const invoiceDate = daysAgo(anchor, 55 - index * 2);
    const selected = invoicePickups.slice(index * 2, index * 2 + 2);
    const subtotal = selected.reduce((sum, item) => sum + Number(item.freightAmount), 0);
    const discountTotal = index % 4 === 0 ? Math.min(10_000, subtotal) : 0;
    const grandTotal = subtotal - discountTotal;
    assertInvoiceInvariant({ subtotal, discountTotal, grandTotal });
    await prisma.invoice.upsert({
      where: { id: invoiceId }, update: { status },
      create: {
        id: invoiceId, tenantId: tenant.id, outletId: outlet.id, invoiceNumber: `${MARKER}-INV-${String(index + 1).padStart(4, "0")}`,
        customerKey: `${MARKER}-CUSTOMER-${index % 5}`, customerNameSnapshot: ["PT Contoh Nusantara", "Toko Maju Bersama", "CV Sinar Abadi", "Gerai Synthetic Indonesia", "Usaha Demo Sejahtera"][index % 5]!,
        companyNameSnapshot: `Perusahaan Synthetic ${index % 5 + 1}`, whatsappSnapshot: "+6280000000300", emailSnapshot: `billing${index % 5}@example.test`,
        addressSnapshot: `Jalan Invoice Synthetic No. ${index + 1}, Kota Uji`, recipientName: `PIC Synthetic ${index % 5 + 1}`,
        recipientPhone: "+6280000000301", recipientCity: "Kota Uji", paymentContactPhone: "+6280000000302",
        transferBankName: "Bank Contoh Indonesia", transferAccountNumber: "000000000001", transferAccountHolder: "NEXTGEN DEVELOPMENT",
        invoiceDate, dueDate: new Date(invoiceDate.getTime() + 14 * DAY_MS), periodStart: new Date(invoiceDate.getTime() - 7 * DAY_MS), periodEnd: invoiceDate,
        subtotal, discountTotal, grandTotal, status,
        notes: `${MARKER} invoice synthetic untuk pengujian UI.`, issuedAt: status === "DRAFT" ? null : atJakartaHour(invoiceDate, 10),
        sentAt: ["SENT", "PAID", "PARTIALLY_PAID"].includes(status) ? atJakartaHour(invoiceDate, 11) : null,
        paidAt: status === "PAID" ? atJakartaHour(new Date(invoiceDate.getTime() + 5 * DAY_MS), 14) : null, createdByUserId: owner.id,
      },
    });
    for (const item of selected) {
      await prisma.invoiceItem.upsert({
        where: { invoiceId_masterPickupId: { invoiceId, masterPickupId: item.id! } }, update: {},
        create: {
          id: id(`invoice-item:${invoiceId}:${item.id}`), tenantId: tenant.id, outletId: outlet.id, invoiceId,
          masterPickupId: item.id!, activeLockKey: status === "DRAFT" ? `${MARKER}:${invoiceId}:${item.id}` : null,
          waybillNumber: item.waybillNo, transactionDate: item.operationalDate, pickupStaff: item.staffName,
          sellerNameSnapshot: item.senderName ?? "Customer Synthetic", weight: 1,
          freightAmount: item.freightAmount, discountAmount: 0, finalAmount: item.freightAmount,
          obligationAmount: item.freightAmount, description: `${MARKER} invoice item synthetic`,
        },
      });
    }
  }

  await prisma.auditLog.deleteMany({
    where: { tenantId: tenant.id, outletId: outlet.id, entityType: { startsWith: `${MARKER}_` } },
  });
  await prisma.auditLog.createMany({
    data: Array.from({ length: 45 }, (_, index) => ({
      tenantId: tenant.id, outletId: outlet.id, actorId: owner.id,
      action: (["CREATE", "UPDATE", "LOGIN", "DELETE"] as const)[index % 4],
      entityType: `${MARKER}_${["SYNC", "PAYMENT", "SETTLEMENT", "SETTINGS"][index % 4]}`,
      entityId: id(`audit-entity:${index}`), metadata: { marker: MARKER, synthetic: true, sequence: index + 1 },
      ipAddress: "192.0.2.10", userAgent: "NEXTGEN DEV UI Seed Synthetic Agent",
      createdAt: new Date(anchor.getTime() - index * 30 * 60_000),
    })),
  });

  console.info(JSON.stringify({
    marker: MARKER, tenant: TENANT_SLUG, outlet: OUTLET_CODE,
    periodStart: daysAgo(anchor, 59).toISOString().slice(0, 10), periodEnd: anchor.toISOString().slice(0, 10),
    counts: {
      team: people.length, syncRuns: syncRuns.length, pickups: pickups.length, dispatches: dispatches.length,
      cod: codRecords.length, settlements: setoran.length, sla: slaRows.length, inventory: inventoryRows.length,
      waybillStatus: statusRows.length, pickupSchedules: schedules.length, attendance: attendanceRows.length,
      attendanceEvents: attendanceEvents.length, leaveRequests: 12, operationalExpenses: expenseRows.length,
      operationalClosings: closingRows.length, cashMovements: movementRows.length, cashflow: cashflowRecords.length,
      invoices: 20, salaryClosings: 2, auditLogs: 45,
    },
  }, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "DEV UI seed failed.");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
