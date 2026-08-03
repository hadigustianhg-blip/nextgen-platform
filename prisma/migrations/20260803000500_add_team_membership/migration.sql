CREATE TYPE "TeamMembershipStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "TeamMembership" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "salaryEmployeeId" UUID NOT NULL,
  "status" "TeamMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "effectiveFrom" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveUntil" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "TeamMembership_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeamMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeamMembership_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeamMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeamMembership_salaryEmployeeId_fkey" FOREIGN KEY ("salaryEmployeeId") REFERENCES "SalaryEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "TeamMembership_tenantId_outletId_status_idx"
  ON "TeamMembership"("tenantId", "outletId", "status");
CREATE INDEX "TeamMembership_userId_status_idx"
  ON "TeamMembership"("userId", "status");
CREATE INDEX "TeamMembership_salaryEmployeeId_status_idx"
  ON "TeamMembership"("salaryEmployeeId", "status");

CREATE UNIQUE INDEX "TeamMembership_one_active_per_user_key"
  ON "TeamMembership"("userId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "TeamMembership_one_active_per_employee_key"
  ON "TeamMembership"("salaryEmployeeId") WHERE "status" = 'ACTIVE';

INSERT INTO "Role" ("id", "tenantId", "code", "name", "description", "isSystem", "createdAt", "updatedAt")
SELECT gen_random_uuid(), tenant."id", 'TEAM', 'TEAM', 'Akun Team / Kurir PWA', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" tenant
WHERE NOT EXISTS (
  SELECT 1 FROM "Role" role WHERE role."tenantId" = tenant."id" AND role."code" = 'TEAM'
);
