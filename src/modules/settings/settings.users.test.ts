import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  role: { findFirst: vi.fn() },
  salaryEmployee: { findFirst: vi.fn() },
  user: { create: vi.fn(), findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), count: vi.fn() },
  userRole: { create: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn() },
  teamMembership: { create: vi.fn(), update: vi.fn() },
  userSession: { deleteMany: vi.fn() },
  auditLog: { create: vi.fn() },
}));
const db = vi.hoisted(() => ({ $transaction: vi.fn() }));

vi.mock("argon2", () => ({ default: { hash: vi.fn(async () => "safe-password-hash"), argon2id: 2 } }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import { createSettingsUser, resetSettingsUserPassword, setSettingsUserStatus, SettingsError, updateSettingsUser } from "./settings.service";

const actor = { tenantId: "tenant-1", outletId: "outlet-1", userId: "owner-1" };
const adminInput = { name: "Admin Baru", email: "ADMIN@EXAMPLE.COM", userType: "ADMIN_WEB" as const, roleCode: "ADMIN", salaryEmployeeId: null, password: "Password123!", confirmPassword: "Password123!", status: "ACTIVE" as const };
const teamInput = { ...adminInput, name: "Kurir Baru", email: "team@example.com", userType: "TEAM_PWA" as const, roleCode: "TEAM", salaryEmployeeId: "10000000-0000-4000-8000-000000000001" };

describe("Settings team-ready user management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    tx.role.findFirst.mockImplementation(async ({ where }: { where: { code: string } }) => ({ id: `role-${where.code}`, code: where.code }));
    tx.salaryEmployee.findFirst.mockResolvedValue({ id: teamInput.salaryEmployeeId });
    tx.user.create.mockResolvedValue({ id: "user-new" });
    tx.user.findUniqueOrThrow.mockResolvedValue({ id: "user-new" });
    tx.user.update.mockResolvedValue({ id: "user-existing" });
    tx.userRole.findFirst.mockResolvedValue(null);
    tx.user.count.mockResolvedValue(2);
    tx.userSession.deleteMany.mockResolvedValue({ count: 1 });
    tx.userRole.create.mockResolvedValue({});
    tx.teamMembership.create.mockResolvedValue({ id: "membership-new" });
    tx.auditLog.create.mockResolvedValue({});
  });

  it("creates an Admin Web user atomically with the existing role", async () => {
    await createSettingsUser(actor, adminInput);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(tx.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tenantId: actor.tenantId, outletId: actor.outletId, email: "admin@example.com", passwordHash: "safe-password-hash" }) }));
    expect(tx.userRole.create).toHaveBeenCalledWith({ data: { userId: "user-new", roleId: "role-ADMIN" } });
    expect(tx.teamMembership.create).not.toHaveBeenCalled();
  });

  it("forces TEAM role and creates the membership in the same transaction", async () => {
    await createSettingsUser(actor, teamInput);
    expect(tx.role.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: actor.tenantId, code: "TEAM" } }));
    expect(tx.salaryEmployee.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: teamInput.salaryEmployeeId, tenantId: actor.tenantId, outletId: actor.outletId, status: "ACTIVE" } }));
    expect(tx.teamMembership.create).toHaveBeenCalledWith({ data: { tenantId: actor.tenantId, outletId: actor.outletId, userId: "user-new", salaryEmployeeId: teamInput.salaryEmployeeId } });
  });

  it("rejects inactive, cross-tenant, or cross-outlet employees without mutating SalaryEmployee", async () => {
    tx.salaryEmployee.findFirst.mockResolvedValue(null);
    await expect(createSettingsUser(actor, teamInput)).rejects.toMatchObject({ code: "SALARY_EMPLOYEE_NOT_AVAILABLE", status: 409 });
    expect(tx.salaryEmployee.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: actor.tenantId, outletId: actor.outletId, status: "ACTIVE" }) }));
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(Object.keys(tx.salaryEmployee)).toEqual(["findFirst"]);
  });

  it("propagates the active membership unique conflict so a second account is rejected", async () => {
    const conflict = Object.assign(new Error("conflict"), { code: "P2002", meta: { target: "TeamMembership_one_active_per_employee_key" } });
    tx.teamMembership.create.mockRejectedValue(conflict);
    await expect(createSettingsUser(actor, teamInput)).rejects.toMatchObject({ code: "P2002" });
  });

  it("changes a Team employee by inactivating the previous membership instead of deleting it", async () => {
    tx.user.findFirst.mockResolvedValue({ id: "user-existing", status: "ACTIVE", roles: [{ role: { code: "TEAM" } }], teamMemberships: [{ id: "membership-old", salaryEmployeeId: "employee-old" }] });
    await updateSettingsUser(actor, "user-existing", { name: teamInput.name, email: teamInput.email, userType: "TEAM_PWA", roleCode: "TEAM", salaryEmployeeId: teamInput.salaryEmployeeId, status: "ACTIVE" });
    expect(tx.teamMembership.update).toHaveBeenCalledWith({ where: { id: "membership-old" }, data: { status: "INACTIVE", effectiveUntil: expect.any(Date) } });
    expect(tx.teamMembership.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ salaryEmployeeId: teamInput.salaryEmployeeId }) }));
    expect(tx.userSession.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-existing" } });
  });

  it("revokes old sessions when resetting a password and keeps the audit free of password data", async () => {
    tx.user.findFirst.mockResolvedValue({ id: "user-existing" });
    await resetSettingsUserPassword(actor, "user-existing", "Password123!");
    expect(tx.userSession.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-existing" } });
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ entityType: "SETTINGS_USER_CREDENTIAL", metadata: { changedFields: ["credentials"] } }) });
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain("Password123!");
  });

  it("protects the last active owner from deactivation", async () => {
    tx.user.findFirst.mockResolvedValue({ id: "owner-target", roles: [{ role: { code: "OWNER" } }], teamMemberships: [] });
    tx.userRole.findFirst.mockResolvedValue({ userId: "owner-target" });
    tx.user.count.mockResolvedValue(1);
    await expect(setSettingsUserStatus(actor, "owner-target", "SUSPENDED")).rejects.toBeInstanceOf(SettingsError);
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
