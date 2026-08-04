import { Prisma, type LeaveRequestStatus, type LeaveRequestType } from "@prisma/client";
import type { SessionContext, TeamContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { LeaveError } from "./leave.http";

type TeamQuery = { page: number; pageSize: number; status?: LeaveRequestStatus };
type AdminQuery = TeamQuery & { startDate?: string; endDate?: string; search?: string; type?: LeaveRequestType };
type CreateInput = { type: LeaveRequestType; startDate: string; endDate: string; reason: string };
type AdminScope = Pick<SessionContext, "tenantId" | "outletId" | "userId" | "roles">;

const dateValue = (value: string) => new Date(`${value}T00:00:00.000Z`);
const dateText = (value: Date) => value.toISOString().slice(0, 10);
const iso = (value: Date | null) => value?.toISOString() ?? null;

const teamSelect = {
  id: true, type: true, startDate: true, endDate: true, reason: true, status: true,
  submittedAt: true, cancelledAt: true, reviewedAt: true, reviewNotes: true,
} satisfies Prisma.LeaveRequestSelect;

const adminInclude = {
  salaryEmployee: { select: { id: true, name: true, division: true } },
  reviewedBy: { select: { id: true, name: true } },
} satisfies Prisma.LeaveRequestInclude;

function teamView(row: Prisma.LeaveRequestGetPayload<{ select: typeof teamSelect }>) {
  return {
    id: row.id, type: row.type, startDate: dateText(row.startDate), endDate: dateText(row.endDate),
    reason: row.reason, status: row.status, submittedAt: row.submittedAt.toISOString(),
    cancelledAt: iso(row.cancelledAt), reviewedAt: iso(row.reviewedAt), reviewNotes: row.reviewNotes,
  };
}

function adminView(row: Prisma.LeaveRequestGetPayload<{ include: typeof adminInclude }>) {
  return {
    ...teamView(row), employee: row.salaryEmployee,
    reviewer: row.reviewedBy ? { id: row.reviewedBy.id, name: row.reviewedBy.name } : null,
  };
}

function requireOutlet(scope: { outletId: string | null }) {
  if (!scope.outletId) throw new LeaveError("OUTLET_REQUIRED", 400);
  return scope.outletId;
}

const auditMetadata = (row: { id: string; salaryEmployeeId: string; type: LeaveRequestType; startDate: Date; endDate: Date }, actorUserId: string, oldStatus: LeaveRequestStatus | null, newStatus: LeaveRequestStatus) => ({
  requestId: row.id,
  salaryEmployeeId: row.salaryEmployeeId,
  type: row.type,
  startDate: dateText(row.startDate),
  endDate: dateText(row.endDate),
  oldStatus,
  newStatus,
  actorUserId,
});

export async function listOwnLeaveRequests(context: TeamContext, input: TeamQuery) {
  const where: Prisma.LeaveRequestWhereInput = {
    tenantId: context.tenantId, outletId: context.outletId, salaryEmployeeId: context.salaryEmployeeId,
    ...(input.status ? { status: input.status } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.leaveRequest.findMany({ where, select: teamSelect, orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }], skip: (input.page - 1) * input.pageSize, take: input.pageSize }),
    prisma.leaveRequest.count({ where }),
  ]);
  return { data: rows.map(teamView), pagination: { page: input.page, pageSize: input.pageSize, total } };
}

export async function getOwnLeaveRequest(context: TeamContext, id: string) {
  const row = await prisma.leaveRequest.findFirst({ where: { id, tenantId: context.tenantId, outletId: context.outletId, salaryEmployeeId: context.salaryEmployeeId }, select: teamSelect });
  if (!row) throw new LeaveError("LEAVE_NOT_FOUND", 404);
  return teamView(row);
}

export async function createOwnLeaveRequest(context: TeamContext, input: CreateInput, now = new Date()) {
  const startDate = dateValue(input.startDate);
  const endDate = dateValue(input.endDate);
  return prisma.$transaction(async (tx) => {
    const duplicate = await tx.leaveRequest.findFirst({ where: { tenantId: context.tenantId, outletId: context.outletId, salaryEmployeeId: context.salaryEmployeeId, type: input.type, startDate, endDate, reason: input.reason, status: "PENDING" }, select: { id: true } });
    if (duplicate) throw new LeaveError("LEAVE_DUPLICATE", 409);
    const row = await tx.leaveRequest.create({ data: { tenantId: context.tenantId, outletId: context.outletId, salaryEmployeeId: context.salaryEmployeeId, type: input.type, startDate, endDate, reason: input.reason, status: "PENDING", submittedAt: now }, select: { ...teamSelect, salaryEmployeeId: true } });
    await tx.auditLog.create({ data: { tenantId: context.tenantId, outletId: context.outletId, actorId: context.userId, action: "CREATE", entityType: "LEAVE_REQUEST_CREATED", entityId: row.id, metadata: auditMetadata(row, context.userId, null, "PENDING") } });
    return teamView(row);
  });
}

export async function cancelOwnLeaveRequest(context: TeamContext, id: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.leaveRequest.findFirst({ where: { id, tenantId: context.tenantId, outletId: context.outletId, salaryEmployeeId: context.salaryEmployeeId } });
    if (!current) throw new LeaveError("LEAVE_NOT_FOUND", 404);
    if (current.status !== "PENDING") throw new LeaveError("LEAVE_NOT_PENDING", 409);
    const changed = await tx.leaveRequest.updateMany({ where: { id: current.id, status: "PENDING" }, data: { status: "CANCELLED", cancelledAt: now } });
    if (changed.count !== 1) throw new LeaveError("LEAVE_NOT_PENDING", 409);
    const row = await tx.leaveRequest.findUniqueOrThrow({ where: { id: current.id }, select: teamSelect });
    await tx.auditLog.create({ data: { tenantId: context.tenantId, outletId: context.outletId, actorId: context.userId, action: "UPDATE", entityType: "LEAVE_REQUEST_CANCELLED", entityId: row.id, metadata: auditMetadata(current, context.userId, "PENDING", "CANCELLED") } });
    return teamView(row);
  });
}

function adminWhere(scope: AdminScope, input: AdminQuery, includeStatus = true): Prisma.LeaveRequestWhereInput {
  const outletId = requireOutlet(scope);
  return {
    tenantId: scope.tenantId, outletId,
    ...(includeStatus && input.status ? { status: input.status } : {}),
    ...(input.type ? { type: input.type } : {}),
    ...(input.startDate || input.endDate ? { startDate: { ...(input.startDate ? { gte: dateValue(input.startDate) } : {}), ...(input.endDate ? { lte: dateValue(input.endDate) } : {}) } } : {}),
    ...(input.search ? { salaryEmployee: { name: { contains: input.search, mode: "insensitive" } } } : {}),
  };
}

export async function listAdminLeaveRequests(scope: AdminScope, input: AdminQuery) {
  const where = adminWhere(scope, input);
  const summaryWhere = adminWhere(scope, input, false);
  const [rows, total, grouped] = await Promise.all([
    prisma.leaveRequest.findMany({ where, include: adminInclude, orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }], skip: (input.page - 1) * input.pageSize, take: input.pageSize }),
    prisma.leaveRequest.count({ where }),
    prisma.leaveRequest.groupBy({ by: ["status"], where: summaryWhere, _count: { _all: true } }),
  ]);
  const summary = { PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0 };
  grouped.forEach((item) => { summary[item.status] = item._count._all; });
  return { data: rows.map(adminView), summary, pagination: { page: input.page, pageSize: input.pageSize, total } };
}

export async function getAdminLeaveRequest(scope: AdminScope, id: string) {
  const row = await prisma.leaveRequest.findFirst({ where: { id, tenantId: scope.tenantId, outletId: requireOutlet(scope) }, include: adminInclude });
  if (!row) throw new LeaveError("LEAVE_NOT_FOUND", 404);
  return adminView(row);
}

async function reviewLeaveRequest(scope: AdminScope, id: string, status: "APPROVED" | "REJECTED", reviewNotes: string | undefined, now: Date) {
  return prisma.$transaction(async (tx) => {
    const outletId = requireOutlet(scope);
    const current = await tx.leaveRequest.findFirst({ where: { id, tenantId: scope.tenantId, outletId } });
    if (!current) throw new LeaveError("LEAVE_NOT_FOUND", 404);
    if (current.status !== "PENDING") throw new LeaveError("LEAVE_NOT_PENDING", 409);
    const changed = await tx.leaveRequest.updateMany({ where: { id: current.id, status: "PENDING" }, data: { status, reviewedAt: now, reviewedByUserId: scope.userId, reviewNotes: reviewNotes || null } });
    if (changed.count !== 1) throw new LeaveError("LEAVE_NOT_PENDING", 409);
    const row = await tx.leaveRequest.findUniqueOrThrow({ where: { id: current.id }, include: adminInclude });
    await tx.auditLog.create({ data: { tenantId: scope.tenantId, outletId, actorId: scope.userId, action: "UPDATE", entityType: status === "APPROVED" ? "LEAVE_REQUEST_APPROVED" : "LEAVE_REQUEST_REJECTED", entityId: row.id, metadata: auditMetadata(current, scope.userId, "PENDING", status) } });
    return adminView(row);
  });
}

export const approveLeaveRequest = (scope: AdminScope, id: string, reviewNotes?: string, now = new Date()) => reviewLeaveRequest(scope, id, "APPROVED", reviewNotes, now);
export const rejectLeaveRequest = (scope: AdminScope, id: string, reviewNotes?: string, now = new Date()) => reviewLeaveRequest(scope, id, "REJECTED", reviewNotes, now);
