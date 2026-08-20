ALTER TABLE "PickupPayment"
ADD COLUMN "transferProofStorageKey" TEXT,
ADD COLUMN "transferProofUpdatedAt" TIMESTAMPTZ(3);
