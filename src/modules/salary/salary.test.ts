import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  salaryProfile: { findMany: vi.fn(), findFirst: vi.fn() },
  salaryEmployee: { findMany: vi.fn() },
  salaryClosing: { findMany: vi.fn(), findFirst: vi.fn() },
  $transaction: vi.fn(),
}));
const tx = vi.hoisted(() => ({
  salaryProfile: {
    create: vi.fn(), findFirst: vi.fn(), findUniqueOrThrow: vi.fn(),
    update: vi.fn(), delete: vi.fn(),
  },
  salaryProfileSetting: { create: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  salaryClosingProfileSnapshot: { findFirst: vi.fn() },
  salaryEmployee: {
    create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn(),
  },
  salaryEmployeeAlias: { updateMany: vi.fn(), deleteMany: vi.fn() },
  salaryEmployeeSnapshot: { findFirst: vi.fn() },
  salaryClosingEmployee: { findFirst: vi.fn() },
  salaryClosingSourceRecord: { findFirst: vi.fn() },
  employeeSalaryAssignment: {
    create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(),
  },
  salaryClosing: { create: vi.fn(), findFirst: vi.fn() },
  salaryClosingSequence: { upsert: vi.fn() },
  salaryAudit: { create: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import {
  SALARY_DELIVERY_SOURCE,
  SALARY_DISPATCH_STATUS,
  SALARY_PICKUP_SOURCE,
  assignSalaryProfile,
  canManageSalaryClosing,
  canManageSalarySetting,
  canReadSalaryRecap,
  createSalaryClosing,
  createSalaryEmployee,
  createSalaryProfile,
  isSalaryEligibleDispatchStatus,
  isSalarySettlement,
  listSalaryClosings,
  listSalaryProfiles,
  removeSalaryEmployee,
  removeSalaryProfile,
  salaryAssignmentSchema,
  salaryAdjustmentSchema,
  salaryClosingSchema,
  salaryDivisionLabels,
  salaryPermissions,
  salaryProfileSchema,
  salaryScope,
  salaryTeamSchema,
  updateSalaryEmployee,
  updateSalaryProfile,
} from ".";

const scope = { tenantId: "tenant-1", outletId: "outlet-1" };
const context = { ...scope, actorId: "user-1", outletCode: "OUT001" };
const session = (roles: string[], overrides: Record<string, unknown> = {}) => ({
  tenantId: scope.tenantId,
  outletId: scope.outletId,
  outletCode: "OUT001",
  roles,
  ...overrides,
} as never);

const profileInput = {
  code: "DRIVER-2026",
  name: "Driver 2026",
  division: "DRIVER" as const,
  description: null,
  effectiveFrom: "2026-08-01",
  effectiveTo: null,
  version: 1,
  basicDailySalary: 100000,
  overtimeRate: null,
  fixedAllowance: null,
  deliveryPerKgAmount: null,
  deliveryPerKgMinWeight: null,
  deliveryPerKgMaxWeight: null,
  deliveryPerWaybillAmount: null,
  deliveryPerWaybillMinWeight: null,
  deliveryPerWaybillMaxWeight: null,
  pickupRegularRevenuePercentage: 5.25,
  pickupRegularPerWaybillAmount: null,
  pickupMarketplacePerWaybillAmount: null,
  dailyFuelMinDeliveryWaybill: null,
  dailyFuelAmount: null,
  dailyExtraMinDeliveryWaybill: null,
  dailyExtraAmount: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (callback) => callback(tx));
  tx.salaryProfile.create.mockResolvedValue({
    id: "profile-1",
    code: "DRIVER-2026",
    version: 1,
    division: "DRIVER",
  });
  tx.salaryProfile.findUniqueOrThrow.mockResolvedValue({
    id: "profile-1",
    setting: {},
  });
  tx.salaryProfileSetting.create.mockResolvedValue({ id: "setting-1" });
  tx.salaryClosingProfileSnapshot.findFirst.mockResolvedValue(null);
  tx.salaryEmployeeSnapshot.findFirst.mockResolvedValue(null);
  tx.salaryClosingEmployee.findFirst.mockResolvedValue(null);
  tx.salaryClosingSourceRecord.findFirst.mockResolvedValue(null);
  tx.employeeSalaryAssignment.findFirst.mockResolvedValue(null);
  tx.salaryAudit.create.mockResolvedValue({ id: "audit-1" });
});

describe("Salary profile validation and persistence", () => {
  it("creates a valid structured salary profile in the active session scope", async () => {
    await expect(createSalaryProfile(context, profileInput)).resolves.toMatchObject({
      id: "profile-1",
    });
    expect(tx.salaryProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: scope.tenantId,
        outletId: scope.outletId,
        createdByUserId: context.actorId,
        status: "DRAFT",
      }),
    });
    expect(tx.salaryProfileSetting.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: scope.tenantId,
        outletId: scope.outletId,
        salaryProfileId: "profile-1",
        deliverySource: SALARY_DELIVERY_SOURCE,
        pickupSource: SALARY_PICKUP_SOURCE,
        dispatchRequiredStatus: SALARY_DISPATCH_STATUS,
      }),
    });
    expect(tx.salaryAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: scope.tenantId,
        outletId: scope.outletId,
        actorId: context.actorId,
        entityType: "SALARY_PROFILE",
      }),
    });
  });

  it("lists profiles only for the active tenant and outlet", async () => {
    db.salaryProfile.findMany.mockResolvedValueOnce([]);
    await listSalaryProfiles(scope);
    expect(db.salaryProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: scope.tenantId, outletId: scope.outletId },
      }),
    );
  });

  it("maps a unique profile version conflict safely", async () => {
    db.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002", clientVersion: "6.19.3",
      }),
    );
    await expect(createSalaryProfile(context, profileInput))
      .rejects.toMatchObject({ code: "SALARY_PROFILE_CONFLICT", status: 409 });
  });

  it.each([
    [{ ...profileInput, effectiveTo: "2026-07-31" }, "effectiveTo"],
    [{ ...profileInput, basicDailySalary: -1 }, "basicDailySalary"],
    [{ ...profileInput, pickupRegularRevenuePercentage: 101 }, "pickupRegularRevenuePercentage"],
    [{
      ...profileInput,
      deliveryPerKgMinWeight: 10,
      deliveryPerKgMaxWeight: 5,
    }, "deliveryPerKgMaxWeight"],
    [{
      ...profileInput,
      deliveryPerKgMinWeight: 10,
      deliveryPerKgMaxWeight: 100,
      deliveryPerWaybillMinWeight: 1,
      deliveryPerWaybillMaxWeight: 15,
    }, "deliveryPerWaybillMinWeight"],
  ])("rejects invalid profile input %#", (input, field) => {
    const result = salaryProfileSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes(field))).toBe(true);
    }
  });

  it("allows empty optional components and preserves decimal percentage precision", () => {
    const parsed = salaryProfileSchema.parse({
      ...profileInput,
      basicDailySalary: null,
      pickupRegularRevenuePercentage: 5.25,
    });
    expect(parsed.basicDailySalary).toBeNull();
    expect(parsed.pickupRegularRevenuePercentage).toBe(5.25);
  });

  it("updates a scoped active profile and records previous and changed values", async () => {
    tx.salaryProfile.findFirst.mockResolvedValueOnce({
      id: "profile-1",
      ...profileInput,
      status: "ACTIVE",
      effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
      effectiveTo: null,
    });
    tx.salaryProfile.update.mockResolvedValueOnce({ id: "profile-1" });
    await updateSalaryProfile(context, "profile-1", {
      ...profileInput,
      name: "Driver 2026 Revisi",
    });
    expect(tx.salaryClosingProfileSnapshot.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: scope.tenantId,
        outletId: scope.outletId,
        salaryProfileId: "profile-1",
        salaryClosing: {
          status: { in: ["CLOSED", "PROCESSED", "PAID"] },
        },
      },
      select: { id: true },
    });
    expect(tx.salaryAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: context.actorId,
        entityType: "SALARY_PROFILE",
        entityId: "profile-1",
        metadata: expect.objectContaining({
          previous: expect.objectContaining({ name: "Driver 2026" }),
          changed: expect.objectContaining({ name: "Driver 2026 Revisi" }),
        }),
      }),
    });
  });

  it("locks a profile used by a final closing without changing its snapshot", async () => {
    tx.salaryProfile.findFirst.mockResolvedValueOnce({
      id: "profile-1",
      ...profileInput,
      status: "ACTIVE",
    });
    tx.salaryClosingProfileSnapshot.findFirst.mockResolvedValueOnce({
      id: "snapshot-1",
    });
    await expect(updateSalaryProfile(context, "profile-1", profileInput))
      .rejects.toMatchObject({ code: "SALARY_PROFILE_FINALIZED", status: 409 });
    expect(tx.salaryProfile.update).not.toHaveBeenCalled();
    expect(tx.salaryProfileSetting.upsert).not.toHaveBeenCalled();
  });
});

describe("Salary team and assignment", () => {
  it("hard deletes an unused scoped team and records TEAM_DELETED", async () => {
    tx.salaryEmployee.findFirst.mockResolvedValueOnce({
      id: "employee-1", name: "Team Baru", status: "ACTIVE",
    });
    tx.salaryEmployee.delete.mockResolvedValueOnce({ id: "employee-1" });

    await expect(removeSalaryEmployee(context, "employee-1")).resolves.toEqual({
      id: "employee-1",
      action: "DELETED",
      message: "Team berhasil dihapus.",
    });
    expect(tx.salaryEmployee.delete).toHaveBeenCalledWith({
      where: { id: "employee-1" },
    });
    expect(tx.salaryAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "TEAM_DELETED" }),
    });
  });

  it("deactivates a team with history without mutating closing snapshots", async () => {
    tx.salaryEmployee.findFirst.mockResolvedValueOnce({
      id: "employee-1", name: "Team Lama", status: "ACTIVE",
    });
    tx.salaryEmployeeSnapshot.findFirst.mockResolvedValueOnce({ id: "snapshot-1" });
    tx.salaryEmployee.update.mockResolvedValueOnce({ id: "employee-1" });

    await expect(removeSalaryEmployee(context, "employee-1")).resolves.toEqual({
      id: "employee-1",
      action: "DEACTIVATED",
      message: "Data dipertahankan karena sudah memiliki histori.",
    });
    expect(tx.salaryEmployee.update).toHaveBeenCalledWith({
      where: { id: "employee-1" }, data: { status: "INACTIVE" },
    });
    expect(tx.employeeSalaryAssignment.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ employeeId: "employee-1", status: "ACTIVE" }),
      data: { status: "INACTIVE" },
    });
    expect(tx.salaryEmployee.delete).not.toHaveBeenCalled();
    expect(tx.salaryEmployeeSnapshot).not.toHaveProperty("update");
    expect(tx.salaryAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "TEAM_DEACTIVATED" }),
    });
  });

  it("rejects deletion of a team outside the session scope", async () => {
    tx.salaryEmployee.findFirst.mockResolvedValueOnce(null);
    await expect(removeSalaryEmployee(context, "other-team"))
      .rejects.toMatchObject({ code: "SALARY_EMPLOYEE_NOT_FOUND", status: 404 });
    expect(tx.salaryEmployee.findFirst).toHaveBeenCalledWith({
      where: {
        id: "other-team", tenantId: scope.tenantId, outletId: scope.outletId,
      },
    });
    expect(tx.salaryEmployee.delete).not.toHaveBeenCalled();
  });

  it("stores WhatsApp as a string and preserves its leading zero", async () => {
    tx.salaryEmployee.create.mockImplementation(async ({ data }) => ({
      id: "employee-1", ...data,
    }));
    const result = await createSalaryEmployee(context, {
      name: "Team A",
      division: "DRIVER",
      whatsapp: "081234567890",
      status: "ACTIVE",
    });
    expect(result.whatsapp).toBe("081234567890");
    expect(typeof result.whatsapp).toBe("string");
    expect(salaryTeamSchema.safeParse({
      name: "Team A", division: "DRIVER",
      whatsapp: "081234567890", status: "ACTIVE",
    }).success).toBe(true);
    expect(salaryAssignmentSchema.safeParse({
      salaryProfileId: "11111111-1111-4111-8111-111111111111",
      effectiveFrom: "2026-08-01",
      effectiveTo: "2026-07-31",
    }).success).toBe(false);
  });

  it("updates team fields and preserves WhatsApp leading zero", async () => {
    tx.salaryEmployee.findFirst.mockResolvedValueOnce({
      id: "employee-1",
      name: "Team Lama",
      division: "DRIVER",
      whatsapp: "0811111111",
      status: "ACTIVE",
    });
    tx.salaryEmployee.update.mockResolvedValueOnce({
      id: "employee-1",
      name: "Team Baru",
      division: "DRIVER",
      whatsapp: "081234567890",
      status: "INACTIVE",
    });
    const result = await updateSalaryEmployee(context, "employee-1", {
      name: "Team Baru",
      division: "DRIVER",
      whatsapp: "081234567890",
      status: "INACTIVE",
    });
    expect(result.whatsapp).toBe("081234567890");
    expect(tx.salaryAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "SALARY_EMPLOYEE",
        metadata: expect.objectContaining({
          previous: expect.objectContaining({ name: "Team Lama" }),
          changed: expect.objectContaining({ name: "Team Baru" }),
        }),
      }),
    });
  });

  it("rejects a division change that conflicts with an active assignment", async () => {
    tx.salaryEmployee.findFirst.mockResolvedValueOnce({
      id: "employee-1",
      name: "Driver",
      division: "DRIVER",
      whatsapp: null,
      status: "ACTIVE",
    });
    tx.employeeSalaryAssignment.findFirst.mockResolvedValueOnce({
      id: "assignment-1",
    });
    await expect(updateSalaryEmployee(context, "employee-1", {
      name: "Driver",
      division: "ADMIN",
      whatsapp: null,
      status: "ACTIVE",
    })).rejects.toMatchObject({
      code: "SALARY_EMPLOYEE_ASSIGNMENT_CONFLICT",
      status: 409,
    });
    expect(tx.salaryEmployee.update).not.toHaveBeenCalled();
  });

  it("assigns only a scoped employee to a scoped active profile", async () => {
    tx.salaryEmployee.findFirst.mockResolvedValueOnce({
      id: "employee-1",
      status: "ACTIVE",
      division: "DRIVER",
    });
    tx.salaryProfile.findFirst.mockResolvedValueOnce({
      id: "profile-1",
      status: "ACTIVE",
      division: "DRIVER",
    });
    tx.employeeSalaryAssignment.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    tx.employeeSalaryAssignment.create.mockResolvedValueOnce({
      id: "assignment-1",
    });
    await assignSalaryProfile(context, "employee-1", {
      salaryProfileId: "profile-1",
      effectiveFrom: "2026-08-01",
      effectiveTo: null,
    });
    expect(tx.salaryEmployee.findFirst).toHaveBeenCalledWith({
      where: {
        id: "employee-1",
        tenantId: scope.tenantId,
        outletId: scope.outletId,
      },
    });
    expect(tx.salaryProfile.findFirst).toHaveBeenCalledWith({
      where: {
        id: "profile-1",
        tenantId: scope.tenantId,
        outletId: scope.outletId,
        status: "ACTIVE",
      },
    });
  });

  it("rejects an employee or profile outside the active scope", async () => {
    tx.salaryEmployee.findFirst.mockResolvedValueOnce(null);
    tx.salaryProfile.findFirst.mockResolvedValueOnce({ id: "profile-1" });
    await expect(assignSalaryProfile(context, "other", {
      salaryProfileId: "profile-1",
      effectiveFrom: "2026-08-01",
    })).rejects.toMatchObject({ code: "SALARY_EMPLOYEE_NOT_FOUND" });
    tx.salaryEmployee.findFirst.mockResolvedValueOnce({
      id: "employee-1", division: "DRIVER",
    });
    tx.salaryProfile.findFirst.mockResolvedValueOnce(null);
    await expect(assignSalaryProfile(context, "employee-1", {
      salaryProfileId: "other",
      effectiveFrom: "2026-08-01",
    })).rejects.toMatchObject({ code: "SALARY_SCOPE_MISMATCH" });
  });

  it("closes an older active assignment before creating the next version", async () => {
    tx.salaryEmployee.findFirst.mockResolvedValueOnce({
      id: "employee-1", division: "DRIVER",
    });
    tx.salaryProfile.findFirst.mockResolvedValueOnce({
      id: "profile-2", division: "DRIVER",
    });
    tx.employeeSalaryAssignment.findFirst
      .mockResolvedValueOnce({
        id: "assignment-old",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        effectiveTo: null,
      })
      .mockResolvedValueOnce(null);
    tx.employeeSalaryAssignment.create.mockResolvedValueOnce({ id: "new" });
    await assignSalaryProfile(context, "employee-1", {
      salaryProfileId: "profile-2",
      effectiveFrom: "2026-08-01",
    });
    expect(tx.employeeSalaryAssignment.update).toHaveBeenCalledWith({
      where: { id: "assignment-old" },
      data: {
        effectiveTo: new Date("2026-07-31T00:00:00.000Z"),
        status: "INACTIVE",
      },
    });
  });

  it("backdates the same active profile to the closing period after submit", async () => {
    tx.salaryEmployee.findFirst.mockResolvedValueOnce({
      id: "employee-1", division: "DRIVER",
    });
    tx.salaryProfile.findFirst.mockResolvedValueOnce({
      id: "profile-1", division: "DRIVER",
    });
    tx.employeeSalaryAssignment.findFirst
      .mockResolvedValueOnce({
        id: "assignment-current",
        salaryProfileId: "profile-1",
        effectiveFrom: new Date("2026-07-31T00:00:00.000Z"),
        effectiveTo: null,
      })
      .mockResolvedValueOnce(null);
    tx.employeeSalaryAssignment.update.mockResolvedValueOnce({
      id: "assignment-current",
      salaryProfileId: "profile-1",
      effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
    });
    await assignSalaryProfile(context, "employee-1", {
      salaryProfileId: "profile-1",
      effectiveFrom: "2026-07-01",
    });
    expect(tx.employeeSalaryAssignment.update).toHaveBeenCalledWith({
      where: { id: "assignment-current" },
      data: { effectiveFrom: new Date("2026-07-01T00:00:00.000Z") },
    });
    expect(tx.employeeSalaryAssignment.create).not.toHaveBeenCalled();
    expect(tx.salaryAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "SALARY_ASSIGNMENT",
        metadata: expect.objectContaining({
          operation: "BACKDATE_ACTIVE_ASSIGNMENT",
        }),
      }),
    });
  });

  it("rejects overlapping historical assignment periods", async () => {
    tx.salaryEmployee.findFirst.mockResolvedValueOnce({
      id: "employee-1", division: "DRIVER",
    });
    tx.salaryProfile.findFirst.mockResolvedValueOnce({
      id: "profile-2", division: "DRIVER",
    });
    tx.employeeSalaryAssignment.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "overlap" });
    await expect(assignSalaryProfile(context, "employee-1", {
      salaryProfileId: "profile-2",
      effectiveFrom: "2026-08-01",
    })).rejects.toMatchObject({ code: "SALARY_ASSIGNMENT_OVERLAP" });
  });
});

describe("Salary profile removal", () => {
  it("hard deletes an unused profile and its setting in one transaction", async () => {
    tx.salaryProfile.findFirst.mockResolvedValueOnce({
      id: "profile-1", code: "NEW", version: 1, status: "DRAFT",
    });
    tx.salaryProfile.delete.mockResolvedValueOnce({ id: "profile-1" });

    await expect(removeSalaryProfile(context, "profile-1")).resolves.toEqual({
      id: "profile-1",
      action: "DELETED",
      message: "Salary profile berhasil dihapus.",
    });
    expect(tx.salaryProfileSetting.deleteMany).toHaveBeenCalledWith({
      where: {
        tenantId: scope.tenantId,
        outletId: scope.outletId,
        salaryProfileId: "profile-1",
      },
    });
    expect(tx.salaryProfile.delete).toHaveBeenCalledWith({
      where: { id: "profile-1" },
    });
    expect(tx.salaryAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "PROFILE_DELETED" }),
    });
  });

  it("deactivates a used profile and keeps historical assignments and snapshots", async () => {
    tx.salaryProfile.findFirst.mockResolvedValueOnce({
      id: "profile-1", code: "USED", version: 1, status: "ACTIVE",
    });
    tx.employeeSalaryAssignment.findFirst.mockResolvedValueOnce({ id: "assignment-1" });
    tx.salaryProfile.update.mockResolvedValueOnce({ id: "profile-1" });

    await expect(removeSalaryProfile(context, "profile-1")).resolves.toEqual({
      id: "profile-1",
      action: "DEACTIVATED",
      message: "Data dipertahankan karena sudah memiliki histori.",
    });
    expect(tx.salaryProfile.update).toHaveBeenCalledWith({
      where: { id: "profile-1" }, data: { status: "INACTIVE" },
    });
    expect(tx.salaryProfile.delete).not.toHaveBeenCalled();
    expect(tx.employeeSalaryAssignment.updateMany).not.toHaveBeenCalled();
    expect(tx.salaryClosingProfileSnapshot).not.toHaveProperty("update");
    expect(tx.salaryAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "PROFILE_DEACTIVATED" }),
    });
  });
});

describe("Salary closing foundation", () => {
  it("creates a DRAFT closing with an outlet-derived sequence number", async () => {
    tx.salaryClosing.findFirst.mockResolvedValueOnce(null);
    tx.salaryClosingSequence.upsert.mockResolvedValueOnce({ lastValue: 1 });
    tx.salaryClosing.create.mockImplementation(async ({ data }) => ({
      id: "closing-1", ...data,
    }));
    const result = await createSalaryClosing(context, {
      periodStart: "2026-08-01",
      periodEnd: "2026-08-15",
      notes: null,
    });
    expect(result).toMatchObject({
      status: "DRAFT",
      closingNumber: "SAL/CLS/OUT001/2026/08/0001",
    });
    expect(tx.salaryClosing.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: scope.tenantId,
        outletId: scope.outletId,
        createdByUserId: context.actorId,
      }),
    });
  });

  it("rejects an overlapping non-void closing period", async () => {
    tx.salaryClosing.findFirst.mockResolvedValueOnce({ id: "existing" });
    await expect(createSalaryClosing(context, {
      periodStart: "2026-08-10",
      periodEnd: "2026-08-20",
    })).rejects.toMatchObject({ code: "SALARY_CLOSING_OVERLAP" });
    expect(tx.salaryClosing.create).not.toHaveBeenCalled();
  });

  it("accepts 16–31 after an existing 1–15 period when no overlap is found", async () => {
    tx.salaryClosing.findFirst.mockResolvedValueOnce(null);
    tx.salaryClosingSequence.upsert.mockResolvedValueOnce({ lastValue: 2 });
    tx.salaryClosing.create.mockResolvedValueOnce({ id: "closing-2" });
    await expect(createSalaryClosing(context, {
      periodStart: "2026-08-16",
      periodEnd: "2026-08-31",
    })).resolves.toEqual({ id: "closing-2" });
  });

  it("lists closings only in the active tenant and outlet and never queries RAW", async () => {
    db.salaryClosing.findMany.mockResolvedValueOnce([]);
    await listSalaryClosings(scope);
    expect(db.salaryClosing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: scope.tenantId, outletId: scope.outletId },
      }),
    );
    expect(JSON.stringify(db)).not.toContain("rawPickup");
    expect(JSON.stringify(db)).not.toContain("rawDispatch");
  });

  it("rejects an invalid date order at the API boundary", () => {
    expect(salaryClosingSchema.safeParse({
      periodStart: "2026-08-20",
      periodEnd: "2026-08-10",
    }).success).toBe(false);
  });

  it("requires positive adjustment amount and a meaningful reason", () => {
    expect(salaryAdjustmentSchema.safeParse({
      salaryClosingEmployeeId: "11111111-1111-4111-8111-111111111111",
      type: "ADDITION",
      category: "Bonus",
      amount: 0,
      reason: "ok",
    }).success).toBe(false);
    expect(salaryAdjustmentSchema.safeParse({
      salaryClosingEmployeeId: "11111111-1111-4111-8111-111111111111",
      type: "DEDUCTION",
      category: "Koreksi",
      amount: 1000,
      reason: "Koreksi valid",
    }).success).toBe(true);
  });
});

describe("Salary domain, permissions, UI and migration contracts", () => {
  it.each([
    ["Penerimaan Normal", true],
    ["PENERIMAAN NORMAL", true],
    [" penerimaan normal ", true],
    ["Gagal Antar", false],
    [null, false],
  ])("normalizes dispatch status %j", (value, expected) => {
    expect(isSalaryEligibleDispatchStatus(value)).toBe(expected);
  });

  it.each([
    ["DFOD", "DFOD"],
    ["dfod", "DFOD"],
    [" DFOD ", "DFOD"],
    [" tunai ", "Tunai"],
    ["BULANAN", "Bulanan"],
  ] as const)("normalizes settlement %j to canonical %j", (value, canonical) => {
    expect(isSalarySettlement(value, canonical)).toBe(true);
  });

  it("keeps canonical labels and division master data outside the frontend", () => {
    expect(SALARY_DISPATCH_STATUS).toBe("Penerimaan Normal");
    expect(salaryDivisionLabels.THREE_WHEEL_DRIVER).toBe("Driver Roda Tiga");
  });

  it("uses role-backed permission gates and active outlet context", () => {
    expect(canManageSalarySetting(session(["OWNER"]))).toBe(true);
    expect(canManageSalaryClosing(session(["ADMIN"]))).toBe(true);
    expect(canManageSalarySetting(session(["VIEWER"]))).toBe(false);
    expect(canReadSalaryRecap(session(["VIEWER"]))).toBe(true);
    expect(salaryScope(session(["ADMIN"]))).toEqual(scope);
    expect(salaryScope(session(["ADMIN"], { outletId: null }))).toBeNull();
    expect(Object.values(salaryPermissions)).toContain("salary.process");
  });

  it("adds only additive salary DDL with financial checks and indexes", async () => {
    const migration = await readFile(
      new URL(
        "../../../prisma/migrations/20260731000200_add_salary_foundation/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    for (const model of [
      "SalaryEmployee", "SalaryProfile", "SalaryProfileSetting",
      "EmployeeSalaryAssignment", "SalaryClosing", "SalaryClosingEmployee",
      "SalaryClosingComponent", "SalaryClosingProfileSnapshot",
      "SalaryAdjustment",
    ]) expect(migration).toContain(`CREATE TABLE "${model}"`);
    expect(migration).toContain("SalaryAdjustment_amount_check");
    expect(migration).toContain("SalaryProfileSetting_non_negative_check");
    expect(migration).not.toMatch(/\b(DROP|TRUNCATE|DELETE FROM)\b/i);
  });

  it("provides responsive pages, safe empty states and no native dialogs", async () => {
    const [setting, closing, recap, sidebar] = await Promise.all([
      readFile(new URL("../../components/finance/salary-setting-client.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../components/finance/salary-closing-client.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../components/finance/salary-recap-empty.tsx", import.meta.url), "utf8"),
      readFile(new URL("../../components/layout/sidebar.tsx", import.meta.url), "utf8"),
    ]);
    expect(setting).toContain("overflow-x-auto");
    expect(setting).toContain("Aktifkan Salary Profile");
    expect(setting).toContain("Edit Salary Profile");
    expect(setting).toContain("Edit Team");
    expect(setting).toContain("Salary profile berhasil diperbarui.");
    expect(setting).toContain("Void closing lama lalu buat dan Generate closing baru.");
    expect(setting).toContain("Data yang sudah memiliki histori");
    expect(setting).toContain('method: "DELETE"');
    expect(setting).toContain("deleteSaving");
    expect(setting).not.toContain("Periode Berlaku");
    expect(setting).not.toContain("RAW_PICKUP");
    expect(setting).not.toContain("RAW_DISPATCH");
    for (const label of [
      "Dispatch", "Pickup", "Penerimaan Normal", "DFOD", "Tunai", "Bulanan",
      "Freight",
    ]) expect(setting).toContain(label);
    expect(setting).toContain("max-w-[960px]");
    expect(setting).toContain("overflow-y-auto");
    expect(setting).toContain("if (profileSaving) return");
    expect(closing).toContain("min-w-[1180px]");
    expect(closing).toContain("Hitung, review, dan finalisasi");
    expect(recap).toContain("Salary yang sudah diproses akan tampil di sini.");
    expect(recap).toContain("Masuk Rekap");
    for (const route of ["salary-setting", "salary-closing", "salary-recap"]) {
      expect(sidebar).toContain(`/dashboard/finance/${route}`);
    }
    expect([setting, closing].join("\n")).not.toMatch(
      /\bwindow\.(alert|prompt|confirm)\s*\(/,
    );
  });
});
