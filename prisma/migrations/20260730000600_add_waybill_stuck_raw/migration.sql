CREATE TABLE "RawInventoryDetail" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "businessDate" DATE NOT NULL,
    "billCode" TEXT NOT NULL,
    "customerName" TEXT,
    "goodsName" TEXT,
    "inventoryHours" INTEGER NOT NULL,
    "operateScanTime2" TEXT,
    "abnormalRegisterTime" TEXT,
    "destinationDistributionName" TEXT,
    "expressTypeName" TEXT,
    "sourceRecordKey" TEXT NOT NULL,
    "sourceHash" CHAR(64) NOT NULL,
    "syncedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "RawInventoryDetail_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RawWaybillStatus" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "businessDate" DATE NOT NULL,
    "sourceWaybill" TEXT NOT NULL,
    "currentScanSite" TEXT,
    "currentScanTime" TEXT,
    "currentScanType" TEXT,
    "scanType" TEXT,
    "problemReason" TEXT,
    "isVoid" TEXT,
    "statusFound" BOOLEAN NOT NULL DEFAULT true,
    "sourceRecordKey" TEXT NOT NULL,
    "sourceHash" CHAR(64) NOT NULL,
    "syncedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "RawWaybillStatus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RawInventoryDetail_tenantId_outletId_businessDate_sourceRecordKey_key"
ON "RawInventoryDetail"("tenantId", "outletId", "businessDate", "sourceRecordKey");
CREATE INDEX "RawInventoryDetail_tenantId_outletId_businessDate_idx"
ON "RawInventoryDetail"("tenantId", "outletId", "businessDate");
CREATE INDEX "RawInventoryDetail_tenantId_outletId_billCode_idx"
ON "RawInventoryDetail"("tenantId", "outletId", "billCode");

CREATE UNIQUE INDEX "RawWaybillStatus_tenantId_outletId_businessDate_sourceRecordKey_key"
ON "RawWaybillStatus"("tenantId", "outletId", "businessDate", "sourceRecordKey");
CREATE INDEX "RawWaybillStatus_tenantId_outletId_businessDate_idx"
ON "RawWaybillStatus"("tenantId", "outletId", "businessDate");
CREATE INDEX "RawWaybillStatus_tenantId_outletId_sourceWaybill_idx"
ON "RawWaybillStatus"("tenantId", "outletId", "sourceWaybill");

ALTER TABLE "RawInventoryDetail" ADD CONSTRAINT "RawInventoryDetail_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RawInventoryDetail" ADD CONSTRAINT "RawInventoryDetail_outletId_fkey"
FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RawWaybillStatus" ADD CONSTRAINT "RawWaybillStatus_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RawWaybillStatus" ADD CONSTRAINT "RawWaybillStatus_outletId_fkey"
FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
