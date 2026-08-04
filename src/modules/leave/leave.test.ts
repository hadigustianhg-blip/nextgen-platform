/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  let rows: Array<Record<string, any>> = [];
  const audits: Array<Record<string, any>> = [];
  const matches = (row: Record<string, any>, where: Record<string, any>) => Object.entries(where).every(([key, value]) => {
    if (key === "salaryEmployee") return true;
    if (key === "startDate" && value && typeof value === "object" && !(value instanceof Date)) {
      const range = value as { gte?: Date; lte?: Date }; return (!range.gte || row.startDate >= range.gte) && (!range.lte || row.startDate <= range.lte);
    }
    if (key === "salaryEmployeeId" || key === "tenantId" || key === "outletId" || key === "id" || key === "type" || key === "status" || key === "reason") return row[key] === value;
    if (key === "endDate" || key === "startDate") return (row[key] as Date).getTime() === (value as Date).getTime();
    return true;
  });
  const leaveRequest = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, any> }) => rows.find((row) => matches(row, where)) ?? null),
    findMany: vi.fn(async ({ where }: { where: Record<string, any> }) => rows.filter((row) => matches(row, where))),
    count: vi.fn(async ({ where }: { where: Record<string, any> }) => rows.filter((row) => matches(row, where)).length),
    groupBy: vi.fn(async ({ where }: { where: Record<string, any> }) => Object.entries(rows.filter((row) => matches(row, where)).reduce<Record<string, number>>((result, row) => ({ ...result, [row.status]: (result[row.status] ?? 0) + 1 }), {})).map(([status, count]) => ({ status, _count: { _all: count } }))),
    create: vi.fn(async ({ data }: { data: Record<string, any> }) => { const row = { id: `leave-${rows.length + 1}`, cancelledAt: null, reviewedAt: null, reviewedByUserId: null, reviewNotes: null, createdAt: data.submittedAt, updatedAt: data.submittedAt, ...data }; rows.push(row); return row; }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => { const found = rows.find((row) => matches(row, where)); if (!found) return { count: 0 }; Object.assign(found, data, { updatedAt: data.reviewedAt ?? data.cancelledAt }); if (data.reviewedByUserId) found.reviewedBy = { id: data.reviewedByUserId, name: "Reviewer" }; return { count: 1 }; }),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => { const row = rows.find((item) => item.id === where.id); if (!row) throw new Error("missing"); return row; }),
  };
  const tx = { leaveRequest, auditLog: { create: vi.fn(async ({ data }: { data: Record<string, any> }) => { audits.push(data); return data; }) } };
  return {
    prisma: { leaveRequest, auditLog: tx.auditLog, $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) },
    reset() { rows = []; audits.length = 0; vi.clearAllMocks(); },
    seed(data: Partial<Record<string, any>> = {}) { const now = new Date("2026-08-04T03:00:00.000Z"); rows.push({ id: `leave-${rows.length + 1}`, tenantId: "tenant-1", outletId: "outlet-1", salaryEmployeeId: "employee-1", type: "LEAVE", startDate: new Date("2026-08-05T00:00:00.000Z"), endDate: new Date("2026-08-06T00:00:00.000Z"), reason: "Keperluan keluarga", status: "PENDING", submittedAt: now, cancelledAt: null, reviewedAt: null, reviewedByUserId: null, reviewNotes: null, createdAt: now, updatedAt: now, salaryEmployee: { id: "employee-1", name: "Team Satu", division: "DRIVER" }, reviewedBy: null, ...data }); return rows.at(-1)!; },
    rows: () => rows,
    audits,
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: db.prisma }));

import { approveLeaveRequest, cancelOwnLeaveRequest, createOwnLeaveRequest, getAdminLeaveRequest, getOwnLeaveRequest, rejectLeaveRequest } from "./leave.service";
import { leaveCreateSchema, leaveRejectSchema } from "./leave.validation";
import { shouldSyncApprovedLeaveToAttendance } from "./leave.attendance-boundary";

const team = { userId: "user-team", tenantId: "tenant-1", tenantName: "Tenant", outletId: "outlet-1", outletCode: "OUT001", membershipId: "member-1", salaryEmployeeId: "employee-1", employeeName: "Team Satu", employeeStatus: "ACTIVE" as const };
const admin = { userId: "user-admin", tenantId: "tenant-1", outletId: "outlet-1", roles: ["ADMIN"] };
const now = new Date("2026-08-04T04:00:00.000Z");

describe("Leave Management", () => {
  beforeEach(() => db.reset());

  it("validates type, reason, and date order", () => {
    expect(leaveCreateSchema.safeParse({ type: "LEAVE", startDate: "2026-08-05", endDate: "2026-08-06", reason: "Alasan valid" }).success).toBe(true);
    expect(leaveCreateSchema.safeParse({ type: "OTHER", startDate: "2026-08-05", endDate: "2026-08-06", reason: "Alasan valid" }).success).toBe(false);
    expect(leaveCreateSchema.safeParse({ type: "LEAVE", startDate: "2026-08-05", endDate: "2026-08-04", reason: "Alasan valid" }).success).toBe(false);
    expect(leaveCreateSchema.safeParse({ type: "LEAVE", startDate: "2026-08-05", endDate: "2026-08-06", reason: "abc" }).success).toBe(false);
    expect(leaveRejectSchema.safeParse({ reviewNotes: "" }).success).toBe(false);
  });

  it("creates a scoped PENDING request and audit event", async () => {
    const result = await createOwnLeaveRequest(team, { type: "SICK", startDate: "2026-08-05", endDate: "2026-08-05", reason: "Perlu istirahat" }, now);
    expect(result).toMatchObject({ type: "SICK", status: "PENDING", startDate: "2026-08-05" });
    expect(db.rows()[0]).toMatchObject({ tenantId: team.tenantId, outletId: team.outletId, salaryEmployeeId: team.salaryEmployeeId });
    expect(db.audits[0]).toMatchObject({ entityType: "LEAVE_REQUEST_CREATED", actorId: team.userId });
  });

  it("rejects an identical pending request", async () => {
    db.seed();
    await expect(createOwnLeaveRequest(team, { type: "LEAVE", startDate: "2026-08-05", endDate: "2026-08-06", reason: "Keperluan keluarga" }, now)).rejects.toMatchObject({ code: "LEAVE_DUPLICATE" });
  });

  it("enforces own tenant, outlet, and employee detail scope", async () => {
    const row = db.seed();
    await expect(getOwnLeaveRequest(team, row.id)).resolves.toMatchObject({ id: row.id });
    await expect(getOwnLeaveRequest({ ...team, tenantId: "tenant-2" }, row.id)).rejects.toMatchObject({ code: "LEAVE_NOT_FOUND" });
    await expect(getOwnLeaveRequest({ ...team, outletId: "outlet-2" }, row.id)).rejects.toMatchObject({ code: "LEAVE_NOT_FOUND" });
    await expect(getOwnLeaveRequest({ ...team, salaryEmployeeId: "employee-2" }, row.id)).rejects.toMatchObject({ code: "LEAVE_NOT_FOUND" });
  });

  it("cancels only a pending own request without deleting it", async () => {
    const row = db.seed();
    await expect(cancelOwnLeaveRequest(team, row.id, now)).resolves.toMatchObject({ status: "CANCELLED", cancelledAt: now.toISOString() });
    expect(db.rows()).toHaveLength(1);
    expect(db.audits.at(-1)).toMatchObject({ entityType: "LEAVE_REQUEST_CANCELLED" });
    db.reset(); const approved = db.seed({ status: "APPROVED", reviewedAt: now, reviewedByUserId: "admin", reviewedBy: { id: "admin", name: "Admin" } });
    await expect(cancelOwnLeaveRequest(team, approved.id, now)).rejects.toMatchObject({ code: "LEAVE_NOT_PENDING" });
  });

  it("approves and rejects pending requests once with an audit event", async () => {
    const approved = db.seed();
    await expect(approveLeaveRequest(admin, approved.id, "Disetujui", now)).resolves.toMatchObject({ status: "APPROVED", reviewNotes: "Disetujui" });
    expect(db.audits.at(-1)).toMatchObject({ entityType: "LEAVE_REQUEST_APPROVED", actorId: admin.userId });
    await expect(approveLeaveRequest(admin, approved.id, undefined, now)).rejects.toMatchObject({ code: "LEAVE_NOT_PENDING" });
    const rejected = db.seed({ id: "leave-reject" });
    await expect(rejectLeaveRequest(admin, rejected.id, "Jadwal operasional penuh", now)).resolves.toMatchObject({ status: "REJECTED" });
    expect(db.audits.at(-1)).toMatchObject({ entityType: "LEAVE_REQUEST_REJECTED" });
    await expect(rejectLeaveRequest(admin, rejected.id, "Alasan lain", now)).rejects.toMatchObject({ code: "LEAVE_NOT_PENDING" });
  });

  it("enforces admin tenant and outlet detail scope", async () => {
    const row = db.seed();
    await expect(getAdminLeaveRequest(admin, row.id)).resolves.toMatchObject({ id: row.id });
    await expect(getAdminLeaveRequest({ ...admin, tenantId: "tenant-2" }, row.id)).rejects.toMatchObject({ code: "LEAVE_NOT_FOUND" });
    await expect(getAdminLeaveRequest({ ...admin, outletId: "outlet-2" }, row.id)).rejects.toMatchObject({ code: "LEAVE_NOT_FOUND" });
  });

  it("keeps Attendance integration disabled in Phase 8", async () => {
    expect(shouldSyncApprovedLeaveToAttendance({ leaveRequestId: "leave-1", tenantId: "tenant-1", outletId: "outlet-1", employeeReferenceId: "employee-1", type: "LEAVE", startDate: "2026-08-05", endDate: "2026-08-06" })).toBe(false);
    const source = await readFile(`${process.cwd()}/src/modules/leave/leave.service.ts`, "utf8");
    expect(source).not.toMatch(/attendanceRecord\.(create|update|upsert|delete)/);
  });

  it("uses an additive migration with required database checks", async () => {
    const migration = await readFile(`${process.cwd()}/prisma/migrations/20260804000300_add_leave_management/migration.sql`, "utf8");
    expect(migration).toContain("LeaveRequest_date_order_check");
    expect(migration).toContain("LeaveRequest_review_state_check");
    expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN/);
  });
});
