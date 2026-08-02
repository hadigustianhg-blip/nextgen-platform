import "server-only";
import {
  Prisma,
  SalaryAssignmentStatus,
  SalaryDivision,
  SalaryEmployeeStatus,
  SalaryProfileStatus,
} from "@prisma/client";
import {
  canonicalDispatchText,
  getActiveDispatchRecords,
} from "@/modules/delivery-settlement/active-dispatch-dataset";
import { SALARY_DISPATCH_STATUS } from "./salary.domain";
import type { SalaryContext } from "./salary.service";

type Transaction = Prisma.TransactionClient;

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export function canonicalizeSalaryPickupSettlement(
  value: string | null | undefined,
): "DFOD" | "Tunai" | "Bulanan" | null {
  if (value == null) return null;
  const normalized = value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("id-ID");
  if (normalized === "dfod") return "DFOD";
  if (normalized === "tunai") return "Tunai";
  if (normalized === "bulanan") return "Bulanan";
  return null;
}

const settingDecimalKeys = [
  "basicDailySalary",
  "overtimeRate",
  "fixedAllowance",
  "deliveryPerKgAmount",
  "deliveryPerKgMinWeight",
  "deliveryPerKgMaxWeight",
  "deliveryPerWaybillAmount",
  "deliveryPerWaybillMinWeight",
  "deliveryPerWaybillMaxWeight",
  "pickupRegularRevenuePercentage",
  "pickupRegularPerWaybillAmount",
  "pickupMarketplacePerWaybillAmount",
  "dailyFuelAmount",
  "dailyExtraAmount",
] as const;

type SnapshotAlias = {
  aliasName: string;
  sourceType: "PICKUP" | "DISPATCH" | "BOTH";
  isActive: boolean;
};

type SnapshotSalarySetting = {
  basicDailySalary: Prisma.Decimal | null;
  overtimeRate: Prisma.Decimal | null;
  fixedAllowance: Prisma.Decimal | null;
  deliveryPerKgAmount: Prisma.Decimal | null;
  deliveryPerKgMinWeight: Prisma.Decimal | null;
  deliveryPerKgMaxWeight: Prisma.Decimal | null;
  deliveryPerWaybillAmount: Prisma.Decimal | null;
  deliveryPerWaybillMinWeight: Prisma.Decimal | null;
  deliveryPerWaybillMaxWeight: Prisma.Decimal | null;
  pickupRegularRevenuePercentage: Prisma.Decimal | null;
  pickupRegularPerWaybillAmount: Prisma.Decimal | null;
  pickupMarketplacePerWaybillAmount: Prisma.Decimal | null;
  dailyFuelMinDeliveryWaybill: number | null;
  dailyFuelAmount: Prisma.Decimal | null;
  dailyExtraMinDeliveryWaybill: number | null;
  dailyExtraAmount: Prisma.Decimal | null;
  dispatchRequiredStatus: string;
};

type SnapshotAssignment = {
  id: string;
  employeeId: string;
  salaryProfileId: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  status: SalaryAssignmentStatus;
  salaryProfile: {
    id: string;
    code: string;
    name: string;
    version: number;
    division: SalaryDivision;
    status: SalaryProfileStatus;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    setting: SnapshotSalarySetting | null;
  };
};

export type SalarySnapshotEmployee = {
  id: string;
  name: string;
  division: SalaryDivision;
  whatsapp: string | null;
  status: SalaryEmployeeStatus;
  aliases: SnapshotAlias[];
  assignments: SnapshotAssignment[];
};

function hydrateAssignment(value: unknown): SnapshotAssignment {
  const assignment = value as SnapshotAssignment;
  assignment.effectiveFrom = new Date(assignment.effectiveFrom);
  assignment.effectiveTo = assignment.effectiveTo
    ? new Date(assignment.effectiveTo)
    : null;
  assignment.salaryProfile.effectiveFrom = new Date(
    assignment.salaryProfile.effectiveFrom,
  );
  assignment.salaryProfile.effectiveTo = assignment.salaryProfile.effectiveTo
    ? new Date(assignment.salaryProfile.effectiveTo)
    : null;
  const setting = assignment.salaryProfile.setting;
  if (setting) {
    for (const key of settingDecimalKeys) {
      const current = setting[key];
      setting[key] = current == null
        ? null
        : new Prisma.Decimal(String(current));
    }
  }
  return assignment;
}

export async function loadSalarySnapshotEmployees(
  tx: Transaction,
  context: Pick<SalaryContext, "tenantId" | "outletId">,
  closingId: string,
): Promise<SalarySnapshotEmployee[]> {
  const rows = await tx.salaryEmployeeSnapshot.findMany({
    where: {
      tenantId: context.tenantId,
      outletId: context.outletId,
      salaryClosingId: closingId,
    },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({
    id: row.salaryEmployeeId,
    name: row.name,
    division: row.division,
    whatsapp: row.whatsapp,
    status: row.status,
    aliases: (row.aliases as unknown as SnapshotAlias[]),
    assignments: (row.assignments as unknown as unknown[]).map(
      hydrateAssignment,
    ),
  }));
}

export async function captureSalaryClosingSnapshots(
  tx: Transaction,
  context: SalaryContext,
  closing: {
    id: string;
    periodStart: Date;
    periodEnd: Date;
    snapshotCapturedAt: Date | null;
  },
) {
  if (closing.snapshotCapturedAt) {
    return loadSalarySnapshotEmployees(tx, context, closing.id);
  }

  const [employees, pickups, dispatches, kasbons] = await Promise.all([
    tx.salaryEmployee.findMany({
      where: {
        tenantId: context.tenantId,
        outletId: context.outletId,
      },
      include: {
        aliases: { where: { isActive: true } },
        assignments: {
          include: { salaryProfile: { include: { setting: true } } },
          orderBy: { effectiveFrom: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    tx.masterPickup.findMany({
      where: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        operationalDate: {
          gte: closing.periodStart,
          lte: closing.periodEnd,
        },
        syncStatus: "NORMALIZED",
      },
      include: {
        rawPickup: { select: { settlementRaw: true } },
      },
      orderBy: [{ operationalDate: "asc" }, { id: "asc" }],
    }),
    getActiveDispatchRecords({
      tenantId: context.tenantId,
      outletId: context.outletId,
      periodStart: closing.periodStart,
      periodEnd: closing.periodEnd,
      status: SALARY_DISPATCH_STATUS,
      client: tx,
    }),
    tx.operationalExpense.findMany({
      where: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        operationalDate: {
          gte: closing.periodStart,
          lte: closing.periodEnd,
        },
        status: "VALID",
        category: { equals: "Kasbon", mode: "insensitive" },
      },
      select: {
        id: true,
        operationalDate: true,
        teamName: true,
        category: true,
        amount: true,
        status: true,
        description: true,
      },
      orderBy: [{ operationalDate: "asc" }, { id: "asc" }],
    }),
  ]);

  if (employees.length) {
    await tx.salaryEmployeeSnapshot.createMany({
      data: employees.map((employee) => ({
        tenantId: context.tenantId,
        outletId: context.outletId,
        salaryClosingId: closing.id,
        salaryEmployeeId: employee.id,
        name: employee.name,
        division: employee.division,
        whatsapp: employee.whatsapp,
        status: employee.status,
        aliases: json(employee.aliases.map((alias) => ({
          aliasName: alias.aliasName,
          sourceType: alias.sourceType,
          isActive: alias.isActive,
        }))),
        assignments: json(employee.assignments),
      })),
    });
  }
  if (pickups.length) {
    await tx.salaryRawPickup.createMany({
      data: pickups.map((pickup) => ({
        tenantId: context.tenantId,
        outletId: context.outletId,
        salaryClosingId: closing.id,
        sourceMasterPickupId: pickup.id,
        operationalDate: pickup.operationalDate,
        waybillNo: pickup.waybillNo,
        staffName: pickup.staffName,
        freightAmount: pickup.freightAmount,
        settlement: canonicalizeSalaryPickupSettlement(
          pickup.rawPickup.settlementRaw,
        ),
        sourceSyncStatus: pickup.syncStatus,
        normalizationVersion: pickup.normalizationVersion,
        sourceSyncedAt: pickup.sourceSyncedAt,
      })),
    });
  }
  if (dispatches.length) {
    await tx.salaryRawDispatch.createMany({
      data: dispatches.map((dispatch) => ({
        tenantId: context.tenantId,
        outletId: context.outletId,
        salaryClosingId: closing.id,
        sourceMasterDispatchId: dispatch.id,
        operationalDate: dispatch.operationalDate,
        waybillNo: canonicalDispatchText(dispatch.waybillNo),
        courierName: dispatch.courierNameRaw,
        deliveryStatus: SALARY_DISPATCH_STATUS,
        chargeWeight: dispatch.chargeWeight,
        sourceSyncStatus: dispatch.syncStatus,
        normalizationVersion: 1,
        sourceSyncedAt: dispatch.sourceFetchedAt,
      })),
    });
  }
  if (kasbons.length) {
    await tx.salaryKasbonSnapshot.createMany({
      data: kasbons.map((kasbon) => ({
        tenantId: context.tenantId,
        outletId: context.outletId,
        salaryClosingId: closing.id,
        sourceOperationalExpenseId: kasbon.id,
        operationalDate: kasbon.operationalDate,
        teamName: kasbon.teamName,
        category: kasbon.category,
        amount: kasbon.amount,
        sourceStatus: kasbon.status,
        description: kasbon.description,
      })),
    });
  }

  await tx.salaryClosing.update({
    where: { id: closing.id },
    data: { snapshotCapturedAt: new Date(), snapshotVersion: 1 },
  });
  await tx.salaryAudit.create({
    data: {
      tenantId: context.tenantId,
      outletId: context.outletId,
      salaryClosingId: closing.id,
      actorId: context.actorId,
      action: "CREATE",
      entityType: "SALARY_CLOSING_SNAPSHOT",
      entityId: closing.id,
      metadata: {
        employeeCount: employees.length,
        pickupCount: pickups.length,
        dispatchCount: dispatches.length,
        kasbonCount: kasbons.length,
        snapshotVersion: 1,
      },
    },
  });

  return loadSalarySnapshotEmployees(tx, context, closing.id);
}

export async function loadSalaryOperationalSnapshots(
  tx: Transaction,
  context: Pick<SalaryContext, "tenantId" | "outletId">,
  closingId: string,
) {
  const [pickups, dispatches, kasbons] = await Promise.all([
    tx.salaryRawPickup.findMany({
      where: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        salaryClosingId: closingId,
      },
      orderBy: [{ operationalDate: "asc" }, { id: "asc" }],
    }),
    tx.salaryRawDispatch.findMany({
      where: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        salaryClosingId: closingId,
      },
      orderBy: [{ operationalDate: "asc" }, { id: "asc" }],
    }),
    tx.salaryKasbonSnapshot.findMany({
      where: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        salaryClosingId: closingId,
      },
      orderBy: [{ operationalDate: "asc" }, { id: "asc" }],
    }),
  ]);
  return { pickups, dispatches, kasbons };
}
