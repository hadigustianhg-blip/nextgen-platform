import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  operationalTargetSetting: { findUnique: vi.fn(), upsert: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import {
  getEffectiveOperationalTargets,
  resolveEffectiveOperationalTargets,
  updateOperationalTargets,
} from "./target-kpi.service";
import { targetKpiUpdateSchema } from "./settings.validation";

const actor = { tenantId: "tenant-1", outletId: "outlet-1", userId: "user-1" };
const emptyInput = {
  achievementDeliveryTarget: null,
  pendingMaximum: null,
  slaTarget: null,
  pickupRevenueTarget: null,
  pickupWeightTarget: null,
  waybillStuckMaximum: null,
};

describe("Operational Target & KPI settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db));
    db.auditLog.create.mockResolvedValue({ id: 1n });
  });

  it("uses only the two canonical defaults and leaves business targets unset", () => {
    const result = resolveEffectiveOperationalTargets(null);
    expect(result.achievementDeliveryTarget).toEqual({ value: 95, source: "CANONICAL" });
    expect(result.slaTarget).toEqual({ value: 95, source: "CANONICAL" });
    expect(result.pendingMaximum).toEqual({ value: null, source: "UNSET" });
    expect(result.pickupRevenueTarget).toEqual({ value: null, source: "UNSET" });
    expect(result.pickupWeightTarget).toEqual({ value: null, source: "UNSET" });
    expect(result.waybillStuckMaximum).toEqual({ value: null, source: "UNSET" });
  });

  it("lets custom outlet values override canonical and unset values", () => {
    const result = resolveEffectiveOperationalTargets({
      achievementDeliveryTarget: "97.5",
      pendingMaximum: 10,
      slaTarget: "98",
      pickupRevenueTarget: "1500000",
      pickupWeightTarget: "250.5",
      waybillStuckMaximum: 8,
    });
    for (const target of Object.values(result)) expect(target.source).toBe("CUSTOM");
    expect(result).toMatchObject({
      achievementDeliveryTarget: { value: 97.5 },
      pendingMaximum: { value: 10 },
      slaTarget: { value: 98 },
      pickupRevenueTarget: { value: 1_500_000 },
      pickupWeightTarget: { value: 250.5 },
      waybillStuckMaximum: { value: 8 },
    });
  });

  it("reads one tenant/outlet scoped record and preserves fallback after refresh", async () => {
    db.operationalTargetSetting.findUnique.mockResolvedValue({ ...emptyInput, pendingMaximum: 12 });
    const result = await getEffectiveOperationalTargets(actor);
    expect(db.operationalTargetSetting.findUnique).toHaveBeenCalledWith({
      where: { tenantId_outletId: { tenantId: actor.tenantId, outletId: actor.outletId } },
    });
    expect(result.pendingMaximum).toEqual({ value: 12, source: "CUSTOM" });
    expect(result.achievementDeliveryTarget).toEqual({ value: 95, source: "CANONICAL" });
  });

  it("persists atomically, scopes from the actor, and records safe audit metadata", async () => {
    db.operationalTargetSetting.findUnique.mockResolvedValue({ id: "setting-1", ...emptyInput });
    db.operationalTargetSetting.upsert.mockResolvedValue({ id: "setting-1", ...emptyInput, pendingMaximum: 7 });
    await updateOperationalTargets(actor, { ...emptyInput, pendingMaximum: 7 });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(db.operationalTargetSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_outletId: { tenantId: actor.tenantId, outletId: actor.outletId } },
      create: expect.objectContaining({ tenantId: actor.tenantId, outletId: actor.outletId, updatedByUserId: actor.userId }),
      update: expect.objectContaining({ pendingMaximum: 7, updatedByUserId: actor.userId }),
    }));
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: "SETTINGS_TARGET_KPI_UPDATED",
      entityType: "SETTINGS_TARGET_KPI_UPDATED",
      actorId: actor.userId,
      tenantId: actor.tenantId,
      outletId: actor.outletId,
      metadata: expect.objectContaining({ fieldChanged: ["pendingMaximum"], outletId: actor.outletId }),
    }) });
    expect(JSON.stringify(db.auditLog.create.mock.calls)).not.toMatch(/cookie|token|password|credential/i);
  });

  it("accepts null reset and rejects invalid percentages, negatives, decimal integers, strings, NaN and Infinity", () => {
    expect(targetKpiUpdateSchema.parse(emptyInput)).toEqual(emptyInput);
    for (const input of [
      { ...emptyInput, achievementDeliveryTarget: 101 },
      { ...emptyInput, slaTarget: -1 },
      { ...emptyInput, pickupRevenueTarget: -1 },
      { ...emptyInput, pendingMaximum: 1.5 },
      { ...emptyInput, waybillStuckMaximum: "" },
      { ...emptyInput, pickupWeightTarget: Number.NaN },
      { ...emptyInput, pickupWeightTarget: Number.POSITIVE_INFINITY },
    ]) expect(targetKpiUpdateSchema.safeParse(input).success).toBe(false);
  });
});
