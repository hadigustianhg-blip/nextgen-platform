ALTER TABLE "RawPickupSchedule"
ADD COLUMN "sourceProvider" TEXT NOT NULL DEFAULT 'LEGACY_PICKUP_SCHEDULING',
ADD COLUMN "externalJfsId" TEXT,
ADD COLUMN "sourceInputAt" TIMESTAMPTZ(3),
ADD COLUMN "sourceUpdatedAt" TIMESTAMPTZ(3),
ADD COLUMN "customerOrderAt" TIMESTAMPTZ(3),
ADD COLUMN "orderSourceCode" TEXT,
ADD COLUMN "orderStatusCode" INTEGER,
ADD COLUMN "customerName" TEXT,
ADD COLUMN "sendName" TEXT,
ADD COLUMN "sendCode" TEXT,
ADD COLUMN "senderCompany" TEXT,
ADD COLUMN "senderProvinceName" TEXT,
ADD COLUMN "senderCityName" TEXT,
ADD COLUMN "senderAreaName" TEXT,
ADD COLUMN "receiverName" TEXT,
ADD COLUMN "receiverCompany" TEXT,
ADD COLUMN "receiverProvinceName" TEXT,
ADD COLUMN "receiverCityName" TEXT,
ADD COLUMN "receiverAreaName" TEXT,
ADD COLUMN "receiverAddress" TEXT,
ADD COLUMN "goodsTypeName" TEXT,
ADD COLUMN "packageNumber" INTEGER,
ADD COLUMN "packageChargeWeight" DECIMAL(12,3),
ADD COLUMN "paymentModeName" TEXT,
ADD COLUMN "paymentModeCode" TEXT,
ADD COLUMN "totalFreight" DECIMAL(18,2),
ADD COLUMN "pickNetworkName" TEXT,
ADD COLUMN "pickStaffName" TEXT,
ADD COLUMN "pickStaffCode" TEXT,
ADD COLUMN "dispatchNetworkAt" TIMESTAMPTZ(3),
ADD COLUMN "dispatchStaffAt" TIMESTAMPTZ(3),
ADD COLUMN "bestPickTimeStartAt" TIMESTAMPTZ(3),
ADD COLUMN "bestPickTimeEndAt" TIMESTAMPTZ(3),
ADD COLUMN "latestPickAt" TIMESTAMPTZ(3),
ADD COLUMN "pickFailReason" TEXT,
ADD COLUMN "pickFailAt" TIMESTAMPTZ(3),
ADD COLUMN "pickFailTimes" INTEGER,
ADD COLUMN "printsNumber" INTEGER,
ADD COLUMN "proxyAreaCode" TEXT,
ADD COLUMN "proxyAreaName" TEXT,
ADD COLUMN "rawPayload" JSONB;

CREATE UNIQUE INDEX "RawPickupSchedule_tenantId_outletId_sourceProvider_externalJfsId_key"
ON "RawPickupSchedule"("tenantId", "outletId", "sourceProvider", "externalJfsId");

CREATE INDEX "RawPickupSchedule_tenantId_outletId_sourceProvider_sourceInputAt_idx"
ON "RawPickupSchedule"("tenantId", "outletId", "sourceProvider", "sourceInputAt");

CREATE INDEX "RawPickupSchedule_tenantId_outletId_orderStatusCode_pickStaffCode_idx"
ON "RawPickupSchedule"("tenantId", "outletId", "orderStatusCode", "pickStaffCode");
