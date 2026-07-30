CREATE TABLE "RawPickupSchedule" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "businessDate" DATE NOT NULL,
    "sourceOrderId" TEXT NOT NULL,
    "waybillNo" TEXT NOT NULL,
    "customerId" TEXT,
    "senderNameMasked" TEXT,
    "senderPhoneMasked" TEXT,
    "pickupAddressMasked" TEXT,
    "sourcePlatform" TEXT,
    "goodsName" TEXT,
    "weight" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "sourceStatus" TEXT,
    "sourceOutletCode" TEXT,
    "sourceNetworkCode" TEXT,
    "sourceInputTime" TEXT,
    "sourceUpdatedTime" TEXT,
    "sourceRecordKey" TEXT NOT NULL,
    "sourceHash" CHAR(64) NOT NULL,
    "syncedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "RawPickupSchedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RawPickupSchedule_tenantId_outletId_businessDate_sourceRecordKey_key"
ON "RawPickupSchedule"("tenantId", "outletId", "businessDate", "sourceRecordKey");
CREATE INDEX "RawPickupSchedule_tenantId_outletId_businessDate_idx"
ON "RawPickupSchedule"("tenantId", "outletId", "businessDate");
CREATE INDEX "RawPickupSchedule_tenantId_outletId_waybillNo_idx"
ON "RawPickupSchedule"("tenantId", "outletId", "waybillNo");
CREATE INDEX "RawPickupSchedule_tenantId_outletId_customerId_idx"
ON "RawPickupSchedule"("tenantId", "outletId", "customerId");

ALTER TABLE "RawPickupSchedule"
ADD CONSTRAINT "RawPickupSchedule_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RawPickupSchedule"
ADD CONSTRAINT "RawPickupSchedule_outletId_fkey"
FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
