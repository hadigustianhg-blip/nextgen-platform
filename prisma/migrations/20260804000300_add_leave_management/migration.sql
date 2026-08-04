CREATE TYPE "LeaveRequestType" AS ENUM ('LEAVE', 'PERMISSION', 'SICK');
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "LeaveRequest" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "salaryEmployeeId" UUID NOT NULL,
  "type" "LeaveRequestType" NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
  "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelledAt" TIMESTAMPTZ(3),
  "reviewedAt" TIMESTAMPTZ(3),
  "reviewedByUserId" UUID,
  "reviewNotes" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LeaveRequest_date_order_check" CHECK ("endDate" >= "startDate"),
  CONSTRAINT "LeaveRequest_reason_not_blank_check" CHECK (length(btrim("reason")) > 0),
  CONSTRAINT "LeaveRequest_cancelled_state_check" CHECK ("cancelledAt" IS NULL OR "status" = 'CANCELLED'),
  CONSTRAINT "LeaveRequest_review_state_check" CHECK (
    ("status" IN ('APPROVED', 'REJECTED') AND "reviewedAt" IS NOT NULL AND "reviewedByUserId" IS NOT NULL)
    OR
    ("status" NOT IN ('APPROVED', 'REJECTED') AND "reviewedAt" IS NULL AND "reviewedByUserId" IS NULL)
  )
);

CREATE INDEX "LeaveRequest_tenantId_outletId_status_idx" ON "LeaveRequest"("tenantId", "outletId", "status");
CREATE INDEX "LeaveRequest_salaryEmployeeId_startDate_idx" ON "LeaveRequest"("salaryEmployeeId", "startDate");
CREATE INDEX "LeaveRequest_reviewedByUserId_idx" ON "LeaveRequest"("reviewedByUserId");

ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_salaryEmployeeId_fkey" FOREIGN KEY ("salaryEmployeeId") REFERENCES "SalaryEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
