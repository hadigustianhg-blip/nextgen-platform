CREATE TABLE "RawSlaCutOff" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "businessDate" DATE NOT NULL,
    "sourceEndpoint" TEXT NOT NULL,
    "sourceRecordKey" TEXT NOT NULL,
    "sourceFetchedAt" TIMESTAMPTZ(3) NOT NULL,
    "syncStatus" "RawSyncStatus" NOT NULL DEFAULT 'NORMALIZED',
    "sourcePayload" JSONB NOT NULL,
    "sla" DECIMAL(7,4) NOT NULL,
    "paketSampai" INTEGER NOT NULL,
    "sudahTandaTerima" INTEGER NOT NULL,
    "belumTandaTerima" INTEGER NOT NULL,
    "lewatSla" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "RawSlaCutOff_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RawSlaCutOff_tenantId_outletId_businessDate_sourceRecordKey_key"
ON "RawSlaCutOff"("tenantId", "outletId", "businessDate", "sourceRecordKey");
CREATE INDEX "RawSlaCutOff_tenantId_outletId_businessDate_idx"
ON "RawSlaCutOff"("tenantId", "outletId", "businessDate");
ALTER TABLE "RawSlaCutOff" ADD CONSTRAINT "RawSlaCutOff_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RawSlaCutOff" ADD CONSTRAINT "RawSlaCutOff_outletId_fkey"
FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
