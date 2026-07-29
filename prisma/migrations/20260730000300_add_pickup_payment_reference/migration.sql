ALTER TABLE "PickupPayment" ADD COLUMN "reference" TEXT;

CREATE INDEX "PickupPayment_tenantId_outletId_reference_idx"
  ON "PickupPayment"("tenantId", "outletId", "reference");
