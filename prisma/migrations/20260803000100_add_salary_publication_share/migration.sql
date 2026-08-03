CREATE TABLE "SalaryPublicationShare" (
  "id" UUID NOT NULL,
  "shareCode" VARCHAR(10) NOT NULL,
  "activeKey" UUID,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "salaryClosingId" UUID NOT NULL,
  "salaryClosingEmployeeId" UUID NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "revokedAt" TIMESTAMPTZ(3),
  "lastAccessAt" TIMESTAMPTZ(3),
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalaryPublicationShare_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalaryPublicationShare_expiry_check"
    CHECK ("expiresAt" > "createdAt")
);

CREATE UNIQUE INDEX "SalaryPublicationShare_shareCode_key"
  ON "SalaryPublicationShare"("shareCode");
CREATE UNIQUE INDEX "SalaryPublicationShare_activeKey_key"
  ON "SalaryPublicationShare"("activeKey");
CREATE INDEX "SalaryPublicationShare_tenantId_outletId_salaryClosingEmployeeId_expiresAt_idx"
  ON "SalaryPublicationShare"("tenantId", "outletId", "salaryClosingEmployeeId", "expiresAt");
CREATE INDEX "SalaryPublicationShare_shareCode_revokedAt_expiresAt_idx"
  ON "SalaryPublicationShare"("shareCode", "revokedAt", "expiresAt");

ALTER TABLE "SalaryPublicationShare"
  ADD CONSTRAINT "SalaryPublicationShare_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryPublicationShare"
  ADD CONSTRAINT "SalaryPublicationShare_outletId_fkey"
  FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryPublicationShare"
  ADD CONSTRAINT "SalaryPublicationShare_salaryClosingId_fkey"
  FOREIGN KEY ("salaryClosingId") REFERENCES "SalaryClosing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryPublicationShare"
  ADD CONSTRAINT "SalaryPublicationShare_salaryClosingEmployeeId_fkey"
  FOREIGN KEY ("salaryClosingEmployeeId") REFERENCES "SalaryClosingEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryPublicationShare"
  ADD CONSTRAINT "SalaryPublicationShare_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
