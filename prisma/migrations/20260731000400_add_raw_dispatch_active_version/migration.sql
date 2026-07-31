ALTER TABLE "RawDispatch"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "RawDispatch_tenantId_outletId_operationalDate_isActive_waybillNo_idx"
ON "RawDispatch"("tenantId", "outletId", "operationalDate", "isActive", "waybillNo");
