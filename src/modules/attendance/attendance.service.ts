import type { AttendanceStatus, Prisma } from "@prisma/client";
import type { SessionContext, TeamContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { jakartaOperationalDate, shiftCalendarDate } from "@/lib/dates/jakarta-date";
import { haversineDistanceMeters } from "./attendance.geo";
import { AttendanceError } from "./attendance.http";
import { MAX_LOCATION_ACCURACY_METERS } from "./attendance.validation";

type LocationInput = { latitude: number; longitude: number; accuracy: number; capturedAt?: string; idempotencyKey: string };
type AdminScope = Pick<SessionContext, "tenantId" | "outletId" | "userId" | "roles">;
const dateValue = (value: string) => new Date(`${value}T00:00:00.000Z`);
const iso = (value: Date | null) => value?.toISOString() ?? null;

export function canManageAttendance(roles: readonly string[]) {
  return roles.some((role) => ["SUPER_ADMIN", "OWNER", "ADMIN", "HR"].includes(role));
}

function requireOutlet(scope: { outletId: string | null }) {
  if (!scope.outletId) throw new AttendanceError("OUTLET_REQUIRED", 400);
  return scope.outletId;
}

function attendanceView(record: {
  id: string; businessDate: Date; status: AttendanceStatus; checkInAt: Date | null; checkOutAt: Date | null;
}) {
  return { id: record.id, businessDate: record.businessDate.toISOString().slice(0, 10), status: record.status, checkInAt: iso(record.checkInAt), checkOutAt: iso(record.checkOutAt) };
}

async function verifyLocation(tenantId: string, outletId: string, input: LocationInput) {
  const setting = await prisma.attendanceLocationSetting.findFirst({
    where: { tenantId, outletId },
    select: { latitude: true, longitude: true, radiusMeters: true, isActive: true },
  });
  if (!setting || !setting.isActive) throw new AttendanceError("ATTENDANCE_LOCATION_NOT_CONFIGURED", 409);
  if (input.accuracy > MAX_LOCATION_ACCURACY_METERS) throw new AttendanceError("LOCATION_ACCURACY_TOO_LOW", 422);
  const distance = haversineDistanceMeters(
    { latitude: Number(setting.latitude), longitude: Number(setting.longitude) },
    { latitude: input.latitude, longitude: input.longitude },
  );
  if (distance > setting.radiusMeters) throw new AttendanceError("OUTSIDE_ATTENDANCE_RADIUS", 422);
  return { distance, radiusMeters: setting.radiusMeters };
}

const eventLocation = (input: LocationInput, distance: number) => ({
  latitude: input.latitude,
  longitude: input.longitude,
  accuracyMeters: input.accuracy,
  capturedAt: input.capturedAt ? new Date(input.capturedAt) : null,
  distanceFromOutletMeters: distance,
  withinRadius: true,
  idempotencyKey: input.idempotencyKey,
});

async function findIdempotentEvent(tx: Prisma.TransactionClient, context: TeamContext, input: LocationInput, eventType: "CLOCK_IN" | "CLOCK_OUT") {
  const event = await tx.attendanceEvent.findUnique({
    where: { tenantId_outletId_idempotencyKey: { tenantId: context.tenantId, outletId: context.outletId, idempotencyKey: input.idempotencyKey } },
    include: { attendanceRecord: true },
  });
  if (!event) return null;
  if (event.eventType !== eventType || event.salaryEmployeeId !== context.salaryEmployeeId) throw new AttendanceError("IDEMPOTENCY_KEY_CONFLICT", 409);
  return attendanceView(event.attendanceRecord);
}

async function replayAfterUniqueConflict(context: TeamContext, input: LocationInput, eventType: "CLOCK_IN" | "CLOCK_OUT") {
  const event = await prisma.attendanceEvent.findUnique({
    where: { tenantId_outletId_idempotencyKey: { tenantId: context.tenantId, outletId: context.outletId, idempotencyKey: input.idempotencyKey } },
    include: { attendanceRecord: true },
  });
  if (event?.eventType === eventType && event.salaryEmployeeId === context.salaryEmployeeId) return { ...attendanceView(event.attendanceRecord), idempotent: true };
  throw new AttendanceError(eventType === "CLOCK_IN" ? "ALREADY_CLOCKED_IN" : "ALREADY_CLOCKED_OUT", 409);
}

export async function clockIn(context: TeamContext, input: LocationInput, now = new Date()) {
  const businessDate = jakartaOperationalDate(now);
  const location = await verifyLocation(context.tenantId, context.outletId, input);
  try { return await prisma.$transaction(async (tx) => {
    const replay = await findIdempotentEvent(tx, context, input, "CLOCK_IN");
    if (replay) return { ...replay, idempotent: true };
    const unique = { tenantId: context.tenantId, outletId: context.outletId, salaryEmployeeId: context.salaryEmployeeId, businessDate: dateValue(businessDate) };
    const existing = await tx.attendanceRecord.findUnique({ where: { tenantId_outletId_salaryEmployeeId_businessDate: unique } });
    if (existing?.checkInAt) throw new AttendanceError("ALREADY_CLOCKED_IN", 409);
    const record = existing
      ? await tx.attendanceRecord.update({ where: { id: existing.id }, data: { checkInAt: now, status: "PRESENT" } })
      : await tx.attendanceRecord.create({ data: { ...unique, checkInAt: now, status: "PRESENT" } });
    await tx.attendanceEvent.create({ data: { tenantId: context.tenantId, outletId: context.outletId, attendanceRecordId: record.id, salaryEmployeeId: context.salaryEmployeeId, eventType: "CLOCK_IN", occurredAt: now, actorUserId: context.userId, ...eventLocation(input, location.distance) } });
    await tx.auditLog.create({ data: { tenantId: context.tenantId, outletId: context.outletId, actorId: context.userId, action: "CREATE", entityType: "ATTENDANCE_CLOCK_IN", entityId: record.id, metadata: { businessDate, withinRadius: true } } });
    return { ...attendanceView(record), idempotent: false };
  }); } catch (error) {
    if ((error as { code?: string }).code === "P2002") return replayAfterUniqueConflict(context, input, "CLOCK_IN");
    throw error;
  }
}

export async function clockOut(context: TeamContext, input: LocationInput, now = new Date()) {
  const businessDate = jakartaOperationalDate(now);
  const location = await verifyLocation(context.tenantId, context.outletId, input);
  try { return await prisma.$transaction(async (tx) => {
    const replay = await findIdempotentEvent(tx, context, input, "CLOCK_OUT");
    if (replay) return { ...replay, idempotent: true };
    const record = await tx.attendanceRecord.findUnique({ where: { tenantId_outletId_salaryEmployeeId_businessDate: { tenantId: context.tenantId, outletId: context.outletId, salaryEmployeeId: context.salaryEmployeeId, businessDate: dateValue(businessDate) } } });
    if (!record?.checkInAt) throw new AttendanceError("CLOCK_IN_REQUIRED", 409);
    if (record.checkOutAt) throw new AttendanceError("ALREADY_CLOCKED_OUT", 409);
    const updated = await tx.attendanceRecord.update({ where: { id: record.id }, data: { checkOutAt: now } });
    await tx.attendanceEvent.create({ data: { tenantId: context.tenantId, outletId: context.outletId, attendanceRecordId: record.id, salaryEmployeeId: context.salaryEmployeeId, eventType: "CLOCK_OUT", occurredAt: now, actorUserId: context.userId, ...eventLocation(input, location.distance) } });
    await tx.auditLog.create({ data: { tenantId: context.tenantId, outletId: context.outletId, actorId: context.userId, action: "UPDATE", entityType: "ATTENDANCE_CLOCK_OUT", entityId: record.id, metadata: { businessDate, withinRadius: true } } });
    return { ...attendanceView(updated), idempotent: false };
  }); } catch (error) {
    if ((error as { code?: string }).code === "P2002") return replayAfterUniqueConflict(context, input, "CLOCK_OUT");
    throw error;
  }
}

export async function getTodayAttendance(context: TeamContext, now = new Date()) {
  const businessDate = jakartaOperationalDate(now);
  const [record, setting] = await Promise.all([
    prisma.attendanceRecord.findUnique({ where: { tenantId_outletId_salaryEmployeeId_businessDate: { tenantId: context.tenantId, outletId: context.outletId, salaryEmployeeId: context.salaryEmployeeId, businessDate: dateValue(businessDate) } } }),
    prisma.attendanceLocationSetting.findFirst({ where: { tenantId: context.tenantId, outletId: context.outletId }, select: { isActive: true, radiusMeters: true } }),
  ]);
  return { businessDate, attendance: record ? attendanceView(record) : null, location: { configured: Boolean(setting), active: setting?.isActive ?? false, radiusMeters: setting?.radiusMeters ?? null } };
}

export async function getAttendanceHistory(context: TeamContext, input: { page: number; pageSize: number; startDate?: string; endDate?: string }, now = new Date()) {
  const endDate = input.endDate ?? jakartaOperationalDate(now);
  const startDate = input.startDate ?? shiftCalendarDate(endDate, -29);
  if (startDate > endDate || new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime() > 90 * 86_400_000) throw new AttendanceError("DATE_RANGE_INVALID", 400);
  const where = { tenantId: context.tenantId, outletId: context.outletId, salaryEmployeeId: context.salaryEmployeeId, businessDate: { gte: dateValue(startDate), lte: dateValue(endDate) } };
  const [rows, total] = await Promise.all([
    prisma.attendanceRecord.findMany({ where, orderBy: { businessDate: "desc" }, skip: (input.page - 1) * input.pageSize, take: input.pageSize }),
    prisma.attendanceRecord.count({ where }),
  ]);
  return { data: rows.map(attendanceView), pagination: { page: input.page, pageSize: input.pageSize, total }, period: { startDate, endDate } };
}

export async function getAttendanceLocation(scope: AdminScope) {
  const outletId = requireOutlet(scope);
  const [outlet, setting] = await Promise.all([
    prisma.outlet.findFirst({ where: { tenantId: scope.tenantId, id: outletId }, select: { id: true, code: true, name: true } }),
    prisma.attendanceLocationSetting.findFirst({ where: { tenantId: scope.tenantId, outletId } }),
  ]);
  if (!outlet) throw new AttendanceError("OUTLET_NOT_FOUND", 404);
  return { outlet, setting: setting ? { latitude: Number(setting.latitude), longitude: Number(setting.longitude), radiusMeters: setting.radiusMeters, isActive: setting.isActive, updatedAt: setting.updatedAt.toISOString() } : null };
}

export async function updateAttendanceLocation(scope: AdminScope, input: { latitude: number; longitude: number; radiusMeters: number; isActive: boolean }) {
  if (!canManageAttendance(scope.roles)) throw new AttendanceError("FORBIDDEN", 403);
  const outletId = requireOutlet(scope);
  return prisma.$transaction(async (tx) => {
    const outlet = await tx.outlet.findFirst({ where: { tenantId: scope.tenantId, id: outletId }, select: { id: true } });
    if (!outlet) throw new AttendanceError("OUTLET_NOT_FOUND", 404);
    const setting = await tx.attendanceLocationSetting.upsert({ where: { tenantId_outletId: { tenantId: scope.tenantId, outletId } }, update: { ...input, updatedByUserId: scope.userId }, create: { tenantId: scope.tenantId, outletId, ...input, updatedByUserId: scope.userId } });
    await tx.auditLog.create({ data: { tenantId: scope.tenantId, outletId, actorId: scope.userId, action: "UPDATE", entityType: "ATTENDANCE_LOCATION_UPDATED", entityId: setting.id, metadata: { radiusMeters: input.radiusMeters, isActive: input.isActive } } });
    return { latitude: Number(setting.latitude), longitude: Number(setting.longitude), radiusMeters: setting.radiusMeters, isActive: setting.isActive };
  });
}

export async function listAttendance(scope: AdminScope, input: { page: number; pageSize: number; businessDate?: string; search?: string; status?: AttendanceStatus }, now = new Date()) {
  const outletId = requireOutlet(scope);
  const businessDate = input.businessDate ?? jakartaOperationalDate(now);
  const where: Prisma.AttendanceRecordWhereInput = { tenantId: scope.tenantId, outletId, businessDate: dateValue(businessDate), ...(input.status ? { status: input.status } : {}), ...(input.search ? { salaryEmployee: { name: { contains: input.search, mode: "insensitive" } } } : {}) };
  const [rows, total] = await Promise.all([
    prisma.attendanceRecord.findMany({ where, include: { salaryEmployee: { select: { name: true, division: true } }, events: { where: { eventType: { in: ["CLOCK_IN", "CLOCK_OUT"] } }, select: { eventType: true, distanceFromOutletMeters: true, withinRadius: true }, orderBy: { createdAt: "desc" } } }, orderBy: [{ salaryEmployee: { name: "asc" } }], skip: (input.page - 1) * input.pageSize, take: input.pageSize }),
    prisma.attendanceRecord.count({ where }),
  ]);
  return { data: rows.map((row) => { const clockIn = row.events.find((event) => event.eventType === "CLOCK_IN"); const clockOut = row.events.find((event) => event.eventType === "CLOCK_OUT"); return { ...attendanceView(row), employeeName: row.salaryEmployee.name, division: row.salaryEmployee.division, clockInDistance: clockIn?.distanceFromOutletMeters ? Number(clockIn.distanceFromOutletMeters) : null, clockOutDistance: clockOut?.distanceFromOutletMeters ? Number(clockOut.distanceFromOutletMeters) : null, withinRadius: [clockIn, clockOut].filter(Boolean).every((event) => event?.withinRadius === true) }; }), pagination: { page: input.page, pageSize: input.pageSize, total }, businessDate };
}

export async function correctAttendance(scope: AdminScope, id: string, input: { checkInAt?: string | null; checkOutAt?: string | null; status?: AttendanceStatus; reason: string }, now = new Date()) {
  if (!canManageAttendance(scope.roles)) throw new AttendanceError("FORBIDDEN", 403);
  const outletId = requireOutlet(scope);
  return prisma.$transaction(async (tx) => {
    const record = await tx.attendanceRecord.findFirst({ where: { id, tenantId: scope.tenantId, outletId } });
    if (!record) throw new AttendanceError("ATTENDANCE_NOT_FOUND", 404);
    const changes = { ...(input.checkInAt !== undefined ? { checkInAt: input.checkInAt ? new Date(input.checkInAt) : null } : {}), ...(input.checkOutAt !== undefined ? { checkOutAt: input.checkOutAt ? new Date(input.checkOutAt) : null } : {}), ...(input.status ? { status: input.status } : {}), correctedAt: now, correctedByUserId: scope.userId, correctionReason: input.reason };
    const nextCheckIn = "checkInAt" in changes ? changes.checkInAt : record.checkInAt;
    const nextCheckOut = "checkOutAt" in changes ? changes.checkOutAt : record.checkOutAt;
    if (nextCheckOut && (!nextCheckIn || nextCheckOut < nextCheckIn)) throw new AttendanceError("ATTENDANCE_TIME_INVALID", 400);
    const updated = await tx.attendanceRecord.update({ where: { id: record.id }, data: changes });
    await tx.attendanceEvent.create({ data: { tenantId: scope.tenantId, outletId, attendanceRecordId: record.id, salaryEmployeeId: record.salaryEmployeeId, eventType: "CORRECTION", occurredAt: now, actorUserId: scope.userId, correctionReason: input.reason } });
    await tx.auditLog.create({ data: { tenantId: scope.tenantId, outletId, actorId: scope.userId, action: "UPDATE", entityType: "ATTENDANCE_CORRECTED", entityId: record.id, metadata: { reason: input.reason, old: { checkInAt: iso(record.checkInAt), checkOutAt: iso(record.checkOutAt), status: record.status }, next: { checkInAt: iso(updated.checkInAt), checkOutAt: iso(updated.checkOutAt), status: updated.status } } } });
    return attendanceView(updated);
  });
}
