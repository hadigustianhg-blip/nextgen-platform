-- Add an optional idempotency key. Nullable keeps the migration safe for any
-- settlement history created before this revision; new writes always provide it.
ALTER TABLE "PickupSettlementRevision"
ADD COLUMN "requestKey" UUID;

CREATE UNIQUE INDEX "PickupSettlementRevision_tenantId_outletId_requestKey_key"
ON "PickupSettlementRevision"("tenantId", "outletId", "requestKey");
