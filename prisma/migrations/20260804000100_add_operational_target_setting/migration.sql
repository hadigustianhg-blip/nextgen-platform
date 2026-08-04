ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SETTINGS_TARGET_KPI_UPDATED';

CREATE TABLE "OperationalTargetSetting" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "achievementDeliveryTarget" DECIMAL(5,2),
  "pendingMaximum" INTEGER,
  "slaTarget" DECIMAL(5,2),
  "pickupRevenueTarget" DECIMAL(18,2),
  "pickupWeightTarget" DECIMAL(12,3),
  "waybillStuckMaximum" INTEGER,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedByUserId" UUID,
  CONSTRAINT "OperationalTargetSetting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OperationalTargetSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OperationalTargetSetting_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OperationalTargetSetting_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "OperationalTargetSetting_achievementDeliveryTarget_check" CHECK ("achievementDeliveryTarget" IS NULL OR ("achievementDeliveryTarget" >= 0 AND "achievementDeliveryTarget" <= 100)),
  CONSTRAINT "OperationalTargetSetting_pendingMaximum_check" CHECK ("pendingMaximum" IS NULL OR "pendingMaximum" >= 0),
  CONSTRAINT "OperationalTargetSetting_slaTarget_check" CHECK ("slaTarget" IS NULL OR ("slaTarget" >= 0 AND "slaTarget" <= 100)),
  CONSTRAINT "OperationalTargetSetting_pickupRevenueTarget_check" CHECK ("pickupRevenueTarget" IS NULL OR "pickupRevenueTarget" >= 0),
  CONSTRAINT "OperationalTargetSetting_pickupWeightTarget_check" CHECK ("pickupWeightTarget" IS NULL OR "pickupWeightTarget" >= 0),
  CONSTRAINT "OperationalTargetSetting_waybillStuckMaximum_check" CHECK ("waybillStuckMaximum" IS NULL OR "waybillStuckMaximum" >= 0)
);

CREATE UNIQUE INDEX "OperationalTargetSetting_tenantId_outletId_key"
  ON "OperationalTargetSetting"("tenantId", "outletId");
CREATE INDEX "OperationalTargetSetting_tenantId_idx"
  ON "OperationalTargetSetting"("tenantId");
CREATE INDEX "OperationalTargetSetting_outletId_idx"
  ON "OperationalTargetSetting"("outletId");
CREATE INDEX "OperationalTargetSetting_updatedByUserId_idx"
  ON "OperationalTargetSetting"("updatedByUserId");
