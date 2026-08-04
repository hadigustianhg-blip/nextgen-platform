import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const records = new Map<string, Record<string, unknown>>();
  const events = new Map<string, Record<string, unknown>>();
  let setting: Record<string, unknown> | null = { latitude: 0, longitude: 0, radiusMeters: 200, isActive: true };
  const keyOf = (where: Record<string, unknown>) => JSON.stringify(where);
  const tx = {
    attendanceRecord: {
      findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => records.get(keyOf(where)) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { const row = { id: `record-${records.size + 1}`, checkOutAt: null, ...data }; const key = { tenantId_outletId_salaryEmployeeId_businessDate: { tenantId: data.tenantId, outletId: data.outletId, salaryEmployeeId: data.salaryEmployeeId, businessDate: data.businessDate } }; records.set(keyOf(key), row); return row; }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => { const entry = [...records.entries()].find(([, row]) => row.id === where.id); if (!entry) throw new Error("missing"); const row = { ...entry[1], ...data }; records.set(entry[0], row); return row; }),
    },
    attendanceEvent: {
      findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => events.get(keyOf(where)) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { const event = { id: `event-${events.size + 1}`, ...data }; const where = { tenantId_outletId_idempotencyKey: { tenantId: data.tenantId, outletId: data.outletId, idempotencyKey: data.idempotencyKey } }; const record = [...records.values()].find((row) => row.id === data.attendanceRecordId); events.set(keyOf(where), { ...event, attendanceRecord: record }); return event; }),
    },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  return {
    records, events, tx,
    reset() { records.clear(); events.clear(); setting = { latitude: 0, longitude: 0, radiusMeters: 200, isActive: true }; vi.clearAllMocks(); },
    setSetting(value: Record<string, unknown> | null) { setting = value; },
    prisma: {
      attendanceLocationSetting: { findFirst: vi.fn(async () => setting) },
      attendanceRecord: tx.attendanceRecord,
      attendanceEvent: tx.attendanceEvent,
      auditLog: tx.auditLog,
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    },
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: db.prisma }));

import { clockIn, clockOut } from "./attendance.service";
import { haversineDistanceMeters } from "./attendance.geo";
import { attendanceCorrectionSchema, attendanceLocationInputSchema } from "./attendance.validation";

const context = { userId: "user-1", tenantId: "tenant-1", tenantName: "Tenant", outletId: "outlet-1", outletCode: "OUT001", membershipId: "member-1", salaryEmployeeId: "employee-1", employeeName: "Team", employeeStatus: "ACTIVE" as const };
const location = (idempotencyKey = "request-key-001") => ({ latitude: 0.0001, longitude: 0.0001, accuracy: 10, capturedAt: "2026-08-04T02:00:00.000Z", idempotencyKey });
const now = new Date("2026-08-03T17:30:00.000Z");

describe("Attendance foundation", () => {
  beforeEach(() => db.reset());

  it("computes distance server-side with Haversine", () => {
    expect(haversineDistanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 })).toBe(0);
    expect(haversineDistanceMeters({ latitude: -6.2, longitude: 106.8 }, { latitude: -6.201, longitude: 106.8 })).toBeGreaterThan(100);
  });

  it("uses server time and Asia/Jakarta business date for one daily record", async () => {
    const result = await clockIn(context, location(), now);
    expect(result).toMatchObject({ businessDate: "2026-08-04", status: "PRESENT", checkInAt: now.toISOString() });
    expect(db.tx.attendanceRecord.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ businessDate: new Date("2026-08-04T00:00:00.000Z"), checkInAt: now }) }));
  });

  it("replays the same clock-in idempotently and rejects another duplicate", async () => {
    await clockIn(context, location("same-key-001"), now);
    await expect(clockIn(context, location("same-key-001"), now)).resolves.toMatchObject({ idempotent: true });
    await expect(clockIn(context, location("new-key-0002"), now)).rejects.toMatchObject({ code: "ALREADY_CLOCKED_IN" });
  });

  it("rejects clock-out without clock-in", async () => {
    await expect(clockOut(context, location(), now)).rejects.toMatchObject({ code: "CLOCK_IN_REQUIRED" });
  });

  it("records clock-out once and replays the same idempotency key", async () => {
    await clockIn(context, location("clock-in-key"), now);
    const later = new Date("2026-08-03T18:30:00.000Z");
    await expect(clockOut(context, location("clock-out-key"), later)).resolves.toMatchObject({ checkOutAt: later.toISOString() });
    await expect(clockOut(context, location("clock-out-key"), later)).resolves.toMatchObject({ idempotent: true });
  });

  it("rejects missing/inactive settings, poor accuracy, and outside radius", async () => {
    db.setSetting(null);
    await expect(clockIn(context, location(), now)).rejects.toMatchObject({ code: "ATTENDANCE_LOCATION_NOT_CONFIGURED" });
    db.setSetting({ latitude: 0, longitude: 0, radiusMeters: 200, isActive: false });
    await expect(clockIn(context, location(), now)).rejects.toMatchObject({ code: "ATTENDANCE_LOCATION_NOT_CONFIGURED" });
    db.setSetting({ latitude: 0, longitude: 0, radiusMeters: 200, isActive: true });
    await expect(clockIn(context, { ...location(), accuracy: 101 }, now)).rejects.toMatchObject({ code: "LOCATION_ACCURACY_TOO_LOW" });
    db.setSetting({ latitude: 0, longitude: 0, radiusMeters: 5, isActive: true });
    await expect(clockIn(context, location(), now)).rejects.toMatchObject({ code: "OUTSIDE_ATTENDANCE_RADIUS" });
  });

  it("ignores any client distance field", () => {
    expect(attendanceLocationInputSchema.safeParse({ ...location(), distanceFromOutletMeters: 0 }).success).toBe(false);
  });

  it("requires a correction reason and at least one changed value", () => {
    expect(attendanceCorrectionSchema.safeParse({ status: "LATE", reason: "Koreksi oleh HR" }).success).toBe(true);
    expect(attendanceCorrectionSchema.safeParse({ status: "LATE", reason: "pendek" }).success).toBe(false);
    expect(attendanceCorrectionSchema.safeParse({ reason: "Alasan cukup panjang" }).success).toBe(false);
  });

  it("keeps append-only events and scoped identities in source", async () => {
    const service = await readFile(`${process.cwd()}/src/modules/attendance/attendance.service.ts`, "utf8");
    expect(service).not.toMatch(/attendanceEvent\.(update|delete)/);
    expect(service).toContain("tenantId: context.tenantId");
    expect(service).toContain("outletId: context.outletId");
    expect(service).toContain("salaryEmployeeId: context.salaryEmployeeId");
    expect(service).not.toContain("input.employeeId");
  });

  it("adds only the additive Attendance schema with database checks", async () => {
    const migration = await readFile(`${process.cwd()}/prisma/migrations/20260804000200_add_attendance_foundation/migration.sql`, "utf8");
    expect(migration).toContain("AttendanceLocationSetting_radiusMeters_check");
    expect(migration).toContain("AttendanceLocationSetting_latitude_check");
    expect(migration).toContain("AttendanceRecord_tenantId_outletId_salaryEmployeeId_businessDate_key");
    expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN/);
  });
});
