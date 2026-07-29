import "server-only";
import { prisma } from "@/lib/db/prisma";
import { SLA_TARGET, summarizeSla } from "./sla-cut-off.calculation";

export async function getSlaCutOff(input: {
  tenantId: string; outletId: string; periodStart: string; periodEnd: string;
}) {
  const rows = await prisma.rawSlaCutOff.findMany({
    where: {
      tenantId: input.tenantId,
      outletId: input.outletId,
      businessDate: {
        gte: new Date(`${input.periodStart}T00:00:00.000Z`),
        lte: new Date(`${input.periodEnd}T00:00:00.000Z`),
      },
      syncStatus: "NORMALIZED",
    },
    orderBy: { businessDate: "desc" },
  });
  const items = rows.map((row) => ({
    businessDate: row.businessDate.toISOString().slice(0, 10),
    sla: Number(row.sla),
    paketSampai: row.paketSampai,
    sudahTandaTerima: row.sudahTandaTerima,
    belumTandaTerima: row.belumTandaTerima,
    lewatSla: row.lewatSla,
    status: Number(row.sla) >= SLA_TARGET ? "ACHIEVE" as const : "NOT_ACHIEVE" as const,
  }));
  return {
    period: { startDate: input.periodStart, endDate: input.periodEnd, target: SLA_TARGET },
    summary: summarizeSla(items),
    items,
  };
}
