-- Salary-owned immutable snapshots captured when a closing is generated.
ALTER TABLE "SalaryClosing"
  ADD COLUMN "snapshotCapturedAt" TIMESTAMPTZ(3),
  ADD COLUMN "snapshotVersion" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "SalaryEmployeeSnapshot" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "salaryClosingId" UUID NOT NULL,
  "salaryEmployeeId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "division" "SalaryDivision" NOT NULL,
  "whatsapp" TEXT,
  "status" "SalaryEmployeeStatus" NOT NULL,
  "aliases" JSONB NOT NULL,
  "assignments" JSONB NOT NULL,
  "capturedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalaryEmployeeSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalaryRawPickup" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "salaryClosingId" UUID NOT NULL,
  "sourceMasterPickupId" UUID NOT NULL,
  "operationalDate" DATE NOT NULL,
  "waybillNo" TEXT NOT NULL,
  "staffName" TEXT,
  "freightAmount" DECIMAL(18,2) NOT NULL,
  "settlement" TEXT,
  "sourceSyncStatus" TEXT NOT NULL,
  "normalizationVersion" INTEGER NOT NULL,
  "sourceSyncedAt" TIMESTAMPTZ(3) NOT NULL,
  "capturedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalaryRawPickup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalaryRawDispatch" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "salaryClosingId" UUID NOT NULL,
  "sourceMasterDispatchId" UUID NOT NULL,
  "operationalDate" DATE NOT NULL,
  "waybillNo" TEXT NOT NULL,
  "courierName" TEXT,
  "deliveryStatus" TEXT,
  "chargeWeight" DECIMAL(12,3) NOT NULL,
  "sourceSyncStatus" TEXT NOT NULL,
  "normalizationVersion" INTEGER NOT NULL,
  "sourceSyncedAt" TIMESTAMPTZ(3) NOT NULL,
  "capturedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalaryRawDispatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalaryKasbonSnapshot" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "salaryClosingId" UUID NOT NULL,
  "sourceOperationalExpenseId" UUID NOT NULL,
  "operationalDate" DATE NOT NULL,
  "teamName" TEXT,
  "category" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "sourceStatus" "OperationalExpenseStatus" NOT NULL,
  "description" TEXT,
  "capturedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalaryKasbonSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalaryKasbonSnapshot_amount_check" CHECK ("amount" >= 0)
);

CREATE TABLE "SalaryCalculationSnapshot" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "salaryClosingEmployeeId" UUID NOT NULL,
  "systemIncomeTotal" DECIMAL(18,2) NOT NULL,
  "manualAdditionTotal" DECIMAL(18,2) NOT NULL,
  "manualDeductionTotal" DECIMAL(18,2) NOT NULL,
  "netSalary" DECIMAL(18,2) NOT NULL,
  "workDayCount" INTEGER NOT NULL,
  "sourcePickupCount" INTEGER NOT NULL,
  "sourceDispatchCount" INTEGER NOT NULL,
  "calculationWarningCount" INTEGER NOT NULL,
  "components" JSONB NOT NULL,
  "calculatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalaryCalculationSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalaryCalculationSnapshot_counts_check" CHECK (
    "workDayCount" >= 0 AND "sourcePickupCount" >= 0 AND
    "sourceDispatchCount" >= 0 AND "calculationWarningCount" >= 0
  )
);

CREATE TABLE "SalaryAudit" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "salaryClosingId" UUID,
  "actorId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalaryAudit_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SalaryKasbonAllocation"
  ADD COLUMN "salaryKasbonSnapshotId" UUID;

CREATE UNIQUE INDEX "SalaryEmployeeSnapshot_salaryClosingId_salaryEmployeeId_key"
  ON "SalaryEmployeeSnapshot"("salaryClosingId", "salaryEmployeeId");
CREATE INDEX "SalaryEmployeeSnapshot_tenantId_outletId_salaryClosingId_idx"
  ON "SalaryEmployeeSnapshot"("tenantId", "outletId", "salaryClosingId");
CREATE UNIQUE INDEX "SalaryRawPickup_salaryClosingId_sourceMasterPickupId_key"
  ON "SalaryRawPickup"("salaryClosingId", "sourceMasterPickupId");
CREATE INDEX "SalaryRawPickup_scope_date_idx"
  ON "SalaryRawPickup"("tenantId", "outletId", "salaryClosingId", "operationalDate");
CREATE UNIQUE INDEX "SalaryRawDispatch_salaryClosingId_sourceMasterDispatchId_key"
  ON "SalaryRawDispatch"("salaryClosingId", "sourceMasterDispatchId");
CREATE INDEX "SalaryRawDispatch_scope_date_idx"
  ON "SalaryRawDispatch"("tenantId", "outletId", "salaryClosingId", "operationalDate");
CREATE UNIQUE INDEX "SalaryKasbonSnapshot_salaryClosingId_sourceOperationalExpenseId_key"
  ON "SalaryKasbonSnapshot"("salaryClosingId", "sourceOperationalExpenseId");
CREATE INDEX "SalaryKasbonSnapshot_scope_team_idx"
  ON "SalaryKasbonSnapshot"("tenantId", "outletId", "salaryClosingId", "teamName");
CREATE UNIQUE INDEX "SalaryCalculationSnapshot_salaryClosingEmployeeId_key"
  ON "SalaryCalculationSnapshot"("salaryClosingEmployeeId");
CREATE INDEX "SalaryCalculationSnapshot_scope_calculated_idx"
  ON "SalaryCalculationSnapshot"("tenantId", "outletId", "calculatedAt");
CREATE INDEX "SalaryAudit_scope_closing_created_idx"
  ON "SalaryAudit"("tenantId", "outletId", "salaryClosingId", "createdAt");
CREATE INDEX "SalaryAudit_entity_idx"
  ON "SalaryAudit"("entityType", "entityId");
CREATE INDEX "SalaryKasbonAllocation_salaryKasbonSnapshotId_status_idx"
  ON "SalaryKasbonAllocation"("salaryKasbonSnapshotId", "status");

ALTER TABLE "SalaryEmployeeSnapshot" ADD CONSTRAINT "SalaryEmployeeSnapshot_salaryClosingId_fkey"
  FOREIGN KEY ("salaryClosingId") REFERENCES "SalaryClosing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryRawPickup" ADD CONSTRAINT "SalaryRawPickup_salaryClosingId_fkey"
  FOREIGN KEY ("salaryClosingId") REFERENCES "SalaryClosing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryRawDispatch" ADD CONSTRAINT "SalaryRawDispatch_salaryClosingId_fkey"
  FOREIGN KEY ("salaryClosingId") REFERENCES "SalaryClosing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryKasbonSnapshot" ADD CONSTRAINT "SalaryKasbonSnapshot_salaryClosingId_fkey"
  FOREIGN KEY ("salaryClosingId") REFERENCES "SalaryClosing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryCalculationSnapshot" ADD CONSTRAINT "SalaryCalculationSnapshot_salaryClosingEmployeeId_fkey"
  FOREIGN KEY ("salaryClosingEmployeeId") REFERENCES "SalaryClosingEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryAudit" ADD CONSTRAINT "SalaryAudit_salaryClosingId_fkey"
  FOREIGN KEY ("salaryClosingId") REFERENCES "SalaryClosing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryKasbonAllocation" ADD CONSTRAINT "SalaryKasbonAllocation_salaryKasbonSnapshotId_fkey"
  FOREIGN KEY ("salaryKasbonSnapshotId") REFERENCES "SalaryKasbonSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
