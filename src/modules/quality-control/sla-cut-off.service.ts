import "server-only";
import { prisma } from "@/lib/db/prisma";
import { SLA_TARGET, summarizeSla } from "./sla-cut-off.calculation";
import { getEffectiveOperationalTargets, type EffectiveOperationalTargets } from "@/modules/settings/target-kpi.service";

export async function getSlaCutOff(input: {
  tenantId: string; outletId: string; periodStart: string; periodEnd: string;
}, providedTargets?: EffectiveOperationalTargets) {
  const targets = providedTargets ?? await getEffectiveOperationalTargets(input);
  const target = targets.slaTarget.value ?? SLA_TARGET;
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
    status: Number(row.sla) >= target ? "ACHIEVE" as const : "NOT_ACHIEVE" as const,
  }));
  const canonicalSummary = summarizeSla(items);
  const averageSla = canonicalSummary.averageSla;
  return {
    period: { startDate: input.periodStart, endDate: input.periodEnd, target, targetSource: targets.slaTarget.source },
    summary: {
      ...canonicalSummary,
      hariAchieve: items.filter((row) => row.sla >= target).length,
      hariNotAchieve: items.filter((row) => row.sla < target).length,
      status: averageSla >= target ? "ACHIEVE" as const : "NOT_ACHIEVE" as const,
    },
    items,
  };
}
