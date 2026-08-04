import "server-only";

import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { DELIVERY_TARGET } from "@/modules/monitoring/monitoring-daily.calculation";
import { SLA_TARGET } from "@/modules/quality-control/sla-cut-off.calculation";
import type { SettingsActor, SettingsScope } from "./settings.types";
import type { targetKpiUpdateSchema } from "./settings.validation";

export type TargetSource = "CUSTOM" | "CANONICAL" | "UNSET";
export type EffectiveTarget = { value: number | null; source: TargetSource };
export type EffectiveOperationalTargets = {
  achievementDeliveryTarget: EffectiveTarget;
  pendingMaximum: EffectiveTarget;
  slaTarget: EffectiveTarget;
  pickupRevenueTarget: EffectiveTarget;
  pickupWeightTarget: EffectiveTarget;
  waybillStuckMaximum: EffectiveTarget;
};
export type TargetKpiUpdateInput = z.infer<typeof targetKpiUpdateSchema>;

type StoredTargets = {
  achievementDeliveryTarget: Prisma.Decimal | number | string | null;
  pendingMaximum: number | null;
  slaTarget: Prisma.Decimal | number | string | null;
  pickupRevenueTarget: Prisma.Decimal | number | string | null;
  pickupWeightTarget: Prisma.Decimal | number | string | null;
  waybillStuckMaximum: number | null;
};

const numeric = (value: StoredTargets[keyof StoredTargets]) => value === null ? null : Number(value);
const custom = (value: StoredTargets[keyof StoredTargets]): EffectiveTarget => ({ value: numeric(value), source: "CUSTOM" });
const canonical = (value: number): EffectiveTarget => ({ value, source: "CANONICAL" });
const unset = (): EffectiveTarget => ({ value: null, source: "UNSET" });

export function resolveEffectiveOperationalTargets(setting: StoredTargets | null): EffectiveOperationalTargets {
  return {
    achievementDeliveryTarget: setting?.achievementDeliveryTarget != null ? custom(setting.achievementDeliveryTarget) : canonical(DELIVERY_TARGET),
    pendingMaximum: setting?.pendingMaximum != null ? custom(setting.pendingMaximum) : unset(),
    slaTarget: setting?.slaTarget != null ? custom(setting.slaTarget) : canonical(SLA_TARGET),
    pickupRevenueTarget: setting?.pickupRevenueTarget != null ? custom(setting.pickupRevenueTarget) : unset(),
    pickupWeightTarget: setting?.pickupWeightTarget != null ? custom(setting.pickupWeightTarget) : unset(),
    waybillStuckMaximum: setting?.waybillStuckMaximum != null ? custom(setting.waybillStuckMaximum) : unset(),
  };
}

export async function getEffectiveOperationalTargets(scope: SettingsScope): Promise<EffectiveOperationalTargets> {
  const setting = await prisma.operationalTargetSetting.findUnique({
    where: { tenantId_outletId: { tenantId: scope.tenantId, outletId: scope.outletId } },
  });
  return resolveEffectiveOperationalTargets(setting);
}

const persisted = (input: TargetKpiUpdateInput) => ({
  achievementDeliveryTarget: input.achievementDeliveryTarget == null ? null : new Prisma.Decimal(input.achievementDeliveryTarget),
  pendingMaximum: input.pendingMaximum,
  slaTarget: input.slaTarget == null ? null : new Prisma.Decimal(input.slaTarget),
  pickupRevenueTarget: input.pickupRevenueTarget == null ? null : new Prisma.Decimal(input.pickupRevenueTarget),
  pickupWeightTarget: input.pickupWeightTarget == null ? null : new Prisma.Decimal(input.pickupWeightTarget),
  waybillStuckMaximum: input.waybillStuckMaximum,
});

export async function updateOperationalTargets(actor: SettingsActor, input: TargetKpiUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const where = { tenantId_outletId: { tenantId: actor.tenantId, outletId: actor.outletId } };
    const previous = await tx.operationalTargetSetting.findUnique({ where });
    const oldEffective = resolveEffectiveOperationalTargets(previous);
    const values = persisted(input);
    const setting = await tx.operationalTargetSetting.upsert({
      where,
      create: { tenantId: actor.tenantId, outletId: actor.outletId, ...values, updatedByUserId: actor.userId },
      update: { ...values, updatedByUserId: actor.userId },
    });
    const newEffective = resolveEffectiveOperationalTargets(setting);
    const fields = Object.keys(newEffective) as Array<keyof EffectiveOperationalTargets>;
    const changed = fields.filter((field) => oldEffective[field].value !== newEffective[field].value || oldEffective[field].source !== newEffective[field].source);
    await tx.auditLog.create({ data: {
      tenantId: actor.tenantId,
      outletId: actor.outletId,
      actorId: actor.userId,
      action: "SETTINGS_TARGET_KPI_UPDATED",
      entityType: "SETTINGS_TARGET_KPI_UPDATED",
      entityId: setting.id,
      metadata: {
        fieldChanged: changed,
        oldValue: Object.fromEntries(changed.map((field) => [field, oldEffective[field].value])),
        newValue: Object.fromEntries(changed.map((field) => [field, newEffective[field].value])),
        oldSource: Object.fromEntries(changed.map((field) => [field, oldEffective[field].source])),
        newSource: Object.fromEntries(changed.map((field) => [field, newEffective[field].source])),
        outletId: actor.outletId,
        timestamp: new Date().toISOString(),
      },
    } });
    return newEffective;
  }, { isolationLevel: "Serializable" });
}
