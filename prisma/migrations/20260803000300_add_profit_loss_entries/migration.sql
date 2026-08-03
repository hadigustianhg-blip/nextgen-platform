CREATE TYPE "ProfitLossDirection" AS ENUM ('INCOME', 'EXPENSE');
CREATE TYPE "ProfitLossEntryStatus" AS ENUM ('ACTIVE', 'VOID');

CREATE TABLE "ProfitLossManualEntry" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "entryDate" DATE NOT NULL,
  "entryType" "ProfitLossDirection" NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "reference" TEXT,
  "status" "ProfitLossEntryStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdByUserId" UUID NOT NULL,
  "voidedAt" TIMESTAMPTZ(3),
  "voidedByUserId" UUID,
  "voidReason" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ProfitLossManualEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProfitLossManualEntry_amount_check" CHECK ("amount" > 0)
);

CREATE TABLE "ProfitLossAdjustment" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "adjustmentDate" DATE NOT NULL,
  "direction" "ProfitLossDirection" NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "ProfitLossEntryStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdByUserId" UUID NOT NULL,
  "voidedAt" TIMESTAMPTZ(3),
  "voidedByUserId" UUID,
  "voidReason" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ProfitLossAdjustment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProfitLossAdjustment_amount_check" CHECK ("amount" > 0)
);

CREATE INDEX "ProfitLossManualEntry_tenantId_outletId_entryDate_idx" ON "ProfitLossManualEntry"("tenantId", "outletId", "entryDate");
CREATE INDEX "ProfitLossManualEntry_tenantId_outletId_entryType_status_idx" ON "ProfitLossManualEntry"("tenantId", "outletId", "entryType", "status");
CREATE INDEX "ProfitLossAdjustment_tenantId_outletId_adjustmentDate_idx" ON "ProfitLossAdjustment"("tenantId", "outletId", "adjustmentDate");
CREATE INDEX "ProfitLossAdjustment_tenantId_outletId_direction_status_idx" ON "ProfitLossAdjustment"("tenantId", "outletId", "direction", "status");

ALTER TABLE "ProfitLossManualEntry" ADD CONSTRAINT "ProfitLossManualEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfitLossManualEntry" ADD CONSTRAINT "ProfitLossManualEntry_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfitLossManualEntry" ADD CONSTRAINT "ProfitLossManualEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfitLossManualEntry" ADD CONSTRAINT "ProfitLossManualEntry_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfitLossAdjustment" ADD CONSTRAINT "ProfitLossAdjustment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfitLossAdjustment" ADD CONSTRAINT "ProfitLossAdjustment_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfitLossAdjustment" ADD CONSTRAINT "ProfitLossAdjustment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfitLossAdjustment" ADD CONSTRAINT "ProfitLossAdjustment_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
