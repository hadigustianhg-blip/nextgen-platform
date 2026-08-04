CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'ABSENT', 'LEAVE', 'SICK', 'PERMISSION');
CREATE TYPE "AttendanceEventType" AS ENUM ('CLOCK_IN', 'CLOCK_OUT', 'CORRECTION');

CREATE TABLE "AttendanceLocationSetting" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "latitude" DECIMAL(9,6) NOT NULL,
  "longitude" DECIMAL(10,6) NOT NULL,
  "radiusMeters" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedByUserId" UUID,
  CONSTRAINT "AttendanceLocationSetting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AttendanceLocationSetting_radiusMeters_check" CHECK ("radiusMeters" > 0),
  CONSTRAINT "AttendanceLocationSetting_latitude_check" CHECK ("latitude" >= -90 AND "latitude" <= 90),
  CONSTRAINT "AttendanceLocationSetting_longitude_check" CHECK ("longitude" >= -180 AND "longitude" <= 180)
);

CREATE TABLE "AttendanceRecord" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "salaryEmployeeId" UUID NOT NULL,
  "businessDate" DATE NOT NULL,
  "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
  "checkInAt" TIMESTAMPTZ(3),
  "checkOutAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "correctedAt" TIMESTAMPTZ(3),
  "correctedByUserId" UUID,
  "correctionReason" TEXT,
  CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AttendanceRecord_time_order_check" CHECK ("checkOutAt" IS NULL OR ("checkInAt" IS NOT NULL AND "checkOutAt" >= "checkInAt"))
);

CREATE TABLE "AttendanceEvent" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "attendanceRecordId" UUID NOT NULL,
  "salaryEmployeeId" UUID NOT NULL,
  "eventType" "AttendanceEventType" NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL,
  "latitude" DECIMAL(9,6),
  "longitude" DECIMAL(10,6),
  "accuracyMeters" DECIMAL(10,2),
  "capturedAt" TIMESTAMPTZ(3),
  "distanceFromOutletMeters" DECIMAL(10,2),
  "withinRadius" BOOLEAN,
  "actorUserId" UUID NOT NULL,
  "correctionReason" TEXT,
  "idempotencyKey" VARCHAR(100),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttendanceEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AttendanceEvent_latitude_check" CHECK ("latitude" IS NULL OR ("latitude" >= -90 AND "latitude" <= 90)),
  CONSTRAINT "AttendanceEvent_longitude_check" CHECK ("longitude" IS NULL OR ("longitude" >= -180 AND "longitude" <= 180)),
  CONSTRAINT "AttendanceEvent_accuracy_check" CHECK ("accuracyMeters" IS NULL OR "accuracyMeters" >= 0),
  CONSTRAINT "AttendanceEvent_distance_check" CHECK ("distanceFromOutletMeters" IS NULL OR "distanceFromOutletMeters" >= 0)
);

CREATE UNIQUE INDEX "AttendanceLocationSetting_outletId_key" ON "AttendanceLocationSetting"("outletId");
CREATE UNIQUE INDEX "AttendanceLocationSetting_tenantId_outletId_key" ON "AttendanceLocationSetting"("tenantId", "outletId");
CREATE INDEX "AttendanceLocationSetting_tenantId_isActive_idx" ON "AttendanceLocationSetting"("tenantId", "isActive");
CREATE UNIQUE INDEX "AttendanceRecord_tenantId_outletId_salaryEmployeeId_businessDate_key" ON "AttendanceRecord"("tenantId", "outletId", "salaryEmployeeId", "businessDate");
CREATE INDEX "AttendanceRecord_tenantId_outletId_businessDate_status_idx" ON "AttendanceRecord"("tenantId", "outletId", "businessDate", "status");
CREATE INDEX "AttendanceRecord_salaryEmployeeId_businessDate_idx" ON "AttendanceRecord"("salaryEmployeeId", "businessDate" DESC);
CREATE UNIQUE INDEX "AttendanceEvent_tenantId_outletId_idempotencyKey_key" ON "AttendanceEvent"("tenantId", "outletId", "idempotencyKey");
CREATE INDEX "AttendanceEvent_attendanceRecordId_createdAt_idx" ON "AttendanceEvent"("attendanceRecordId", "createdAt");
CREATE INDEX "AttendanceEvent_tenantId_outletId_salaryEmployeeId_occurredAt_idx" ON "AttendanceEvent"("tenantId", "outletId", "salaryEmployeeId", "occurredAt" DESC);
CREATE UNIQUE INDEX "AttendanceEvent_one_clock_in_per_record_key" ON "AttendanceEvent"("attendanceRecordId") WHERE "eventType" = 'CLOCK_IN';
CREATE UNIQUE INDEX "AttendanceEvent_one_clock_out_per_record_key" ON "AttendanceEvent"("attendanceRecordId") WHERE "eventType" = 'CLOCK_OUT';

ALTER TABLE "AttendanceLocationSetting" ADD CONSTRAINT "AttendanceLocationSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceLocationSetting" ADD CONSTRAINT "AttendanceLocationSetting_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceLocationSetting" ADD CONSTRAINT "AttendanceLocationSetting_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_salaryEmployeeId_fkey" FOREIGN KEY ("salaryEmployeeId") REFERENCES "SalaryEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_correctedByUserId_fkey" FOREIGN KEY ("correctedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "AttendanceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_salaryEmployeeId_fkey" FOREIGN KEY ("salaryEmployeeId") REFERENCES "SalaryEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
