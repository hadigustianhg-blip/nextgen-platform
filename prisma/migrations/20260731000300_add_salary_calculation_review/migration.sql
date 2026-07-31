CREATE TYPE "SalaryAliasSourceType" AS ENUM ('PICKUP', 'DISPATCH', 'BOTH');
CREATE TYPE "SalarySourceType" AS ENUM ('PICKUP', 'DISPATCH');
CREATE TYPE "SalarySourceCalculationStatus" AS ENUM ('INCLUDED', 'EXCLUDED', 'UNMATCHED');
CREATE TYPE "SalaryKasbonAllocationStatus" AS ENUM ('DRAFT', 'FINALIZED', 'VOID');

ALTER TABLE "SalaryClosing"
  ADD COLUMN "generatedAt" TIMESTAMPTZ(3),
  ADD COLUMN "calculationWarningCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "voidedAt" TIMESTAMPTZ(3),
  ADD COLUMN "voidedByUserId" UUID,
  ADD COLUMN "voidReason" TEXT;

ALTER TABLE "SalaryClosingEmployee"
  ADD COLUMN "workDayCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sourcePickupCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sourceDispatchCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "calculationWarningCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "generatedAt" TIMESTAMPTZ(3);

ALTER TABLE "SalaryClosingProfileSnapshot"
  ADD COLUMN "effectiveFrom" DATE,
  ADD COLUMN "effectiveTo" DATE,
  ADD COLUMN "pickupRegularSettlements" JSONB,
  ADD COLUMN "pickupMarketplaceSettlements" JSONB,
  ADD COLUMN "generatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "SalaryEmployeeAlias" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "salaryEmployeeId" UUID NOT NULL,
  "sourceType" "SalaryAliasSourceType" NOT NULL,
  "aliasName" TEXT NOT NULL,
  "normalizedAlias" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "SalaryEmployeeAlias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalaryClosingSourceRecord" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "salaryClosingId" UUID NOT NULL,
  "salaryClosingEmployeeId" UUID,
  "sourceType" "SalarySourceType" NOT NULL,
  "sourceRecordId" UUID NOT NULL,
  "sourceKey" TEXT,
  "sourceDate" DATE NOT NULL,
  "waybillNumber" TEXT,
  "employeeNameRaw" TEXT,
  "matchedSalaryEmployeeId" UUID,
  "calculationStatus" "SalarySourceCalculationStatus" NOT NULL,
  "exclusionReason" TEXT,
  "calculationType" TEXT,
  "weight" DECIMAL(12,3),
  "settlement" TEXT,
  "freight" DECIMAL(18,2),
  "rate" DECIMAL(18,4),
  "amount" DECIMAL(18,2),
  "metadata" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalaryClosingSourceRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalaryKasbonAllocation" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "salaryClosingEmployeeId" UUID NOT NULL,
  "operationalExpenseId" UUID NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "status" "SalaryKasbonAllocationStatus" NOT NULL DEFAULT 'DRAFT',
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "finalizedAt" TIMESTAMPTZ(3),
  "voidedAt" TIMESTAMPTZ(3),
  "voidedByUserId" UUID,
  "voidReason" TEXT,
  CONSTRAINT "SalaryKasbonAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalaryEmployeeAlias_tenant_outlet_source_alias_key"
  ON "SalaryEmployeeAlias"("tenantId", "outletId", "sourceType", "normalizedAlias");
CREATE INDEX "SalaryEmployeeAlias_tenant_outlet_employee_active_idx"
  ON "SalaryEmployeeAlias"("tenantId", "outletId", "salaryEmployeeId", "isActive");

CREATE INDEX "SalaryClosingSourceRecord_closing_status_idx"
  ON "SalaryClosingSourceRecord"("tenantId", "outletId", "salaryClosingId", "sourceType", "calculationStatus");
CREATE INDEX "SalaryClosingSourceRecord_source_active_idx"
  ON "SalaryClosingSourceRecord"("tenantId", "outletId", "sourceType", "sourceRecordId", "isActive");
CREATE INDEX "SalaryClosingSourceRecord_employee_date_idx"
  ON "SalaryClosingSourceRecord"("salaryClosingEmployeeId", "sourceDate");
CREATE UNIQUE INDEX "SalaryClosingSourceRecord_active_source_key"
  ON "SalaryClosingSourceRecord"("tenantId", "outletId", "sourceType", "sourceRecordId")
  WHERE "isActive" = true;

CREATE INDEX "SalaryKasbonAllocation_employee_status_idx"
  ON "SalaryKasbonAllocation"("tenantId", "outletId", "salaryClosingEmployeeId", "status");
CREATE INDEX "SalaryKasbonAllocation_expense_status_idx"
  ON "SalaryKasbonAllocation"("tenantId", "outletId", "operationalExpenseId", "status");
CREATE UNIQUE INDEX "SalaryKasbonAllocation_employee_expense_key"
  ON "SalaryKasbonAllocation"("salaryClosingEmployeeId", "operationalExpenseId");

ALTER TABLE "SalaryClosing"
  ADD CONSTRAINT "SalaryClosing_voidedByUserId_fkey"
  FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SalaryEmployeeAlias"
  ADD CONSTRAINT "SalaryEmployeeAlias_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SalaryEmployeeAlias_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SalaryEmployeeAlias_salaryEmployeeId_fkey" FOREIGN KEY ("salaryEmployeeId") REFERENCES "SalaryEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SalaryClosingSourceRecord"
  ADD CONSTRAINT "SalaryClosingSourceRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SalaryClosingSourceRecord_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SalaryClosingSourceRecord_salaryClosingId_fkey" FOREIGN KEY ("salaryClosingId") REFERENCES "SalaryClosing"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SalaryClosingSourceRecord_salaryClosingEmployeeId_fkey" FOREIGN KEY ("salaryClosingEmployeeId") REFERENCES "SalaryClosingEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SalaryClosingSourceRecord_matchedSalaryEmployeeId_fkey" FOREIGN KEY ("matchedSalaryEmployeeId") REFERENCES "SalaryEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SalaryKasbonAllocation"
  ADD CONSTRAINT "SalaryKasbonAllocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SalaryKasbonAllocation_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SalaryKasbonAllocation_salaryClosingEmployeeId_fkey" FOREIGN KEY ("salaryClosingEmployeeId") REFERENCES "SalaryClosingEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SalaryKasbonAllocation_operationalExpenseId_fkey" FOREIGN KEY ("operationalExpenseId") REFERENCES "OperationalExpense"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SalaryKasbonAllocation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SalaryKasbonAllocation_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SalaryClosing"
  ADD CONSTRAINT "SalaryClosing_calculation_counts_check"
  CHECK ("calculationWarningCount" >= 0);
ALTER TABLE "SalaryClosingEmployee"
  ADD CONSTRAINT "SalaryClosingEmployee_calculation_counts_check"
  CHECK ("workDayCount" >= 0 AND "sourcePickupCount" >= 0 AND "sourceDispatchCount" >= 0 AND "calculationWarningCount" >= 0);
ALTER TABLE "SalaryKasbonAllocation"
  ADD CONSTRAINT "SalaryKasbonAllocation_amount_check"
  CHECK ("amount" > 0);
