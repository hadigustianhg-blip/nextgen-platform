CREATE TYPE "CashDirection" AS ENUM ('IN', 'OUT');
CREATE TYPE "CashChannel" AS ENUM ('CASH', 'BANK');
CREATE TYPE "CashMovementType" AS ENUM (
  'PICKUP_PAYMENT',
  'DELIVERY_PAYMENT',
  'BANK_DEPOSIT',
  'OPERATIONAL_EXPENSE',
  'CASH_WITHDRAWAL',
  'MANUAL_INCOME',
  'MANUAL_EXPENSE',
  'REFUND',
  'ADJUSTMENT',
  'TRANSFER'
);
CREATE TYPE "CashMovementStatus" AS ENUM ('VALID', 'VOID');

CREATE TABLE "CashMovement" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "businessDate" DATE NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL,
  "direction" "CashDirection" NOT NULL,
  "channel" "CashChannel" NOT NULL,
  "movementType" "CashMovementType" NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "description" TEXT,
  "reference" TEXT,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "requestKey" UUID NOT NULL,
  "recordStatus" "CashMovementStatus" NOT NULL DEFAULT 'VALID',
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CashMovement_tenantId_outletId_requestKey_direction_channel_key"
  ON "CashMovement"("tenantId", "outletId", "requestKey", "direction", "channel");
CREATE UNIQUE INDEX "CashMovement_tenantId_outletId_sourceType_sourceId_direction_channel_key"
  ON "CashMovement"("tenantId", "outletId", "sourceType", "sourceId", "direction", "channel");
CREATE INDEX "CashMovement_tenantId_outletId_businessDate_occurredAt_idx"
  ON "CashMovement"("tenantId", "outletId", "businessDate", "occurredAt");
CREATE INDEX "CashMovement_tenantId_outletId_recordStatus_channel_idx"
  ON "CashMovement"("tenantId", "outletId", "recordStatus", "channel");
CREATE INDEX "CashMovement_tenantId_outletId_reference_idx"
  ON "CashMovement"("tenantId", "outletId", "reference");

ALTER TABLE "CashMovement"
  ADD CONSTRAINT "CashMovement_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashMovement"
  ADD CONSTRAINT "CashMovement_outletId_fkey"
  FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashMovement"
  ADD CONSTRAINT "CashMovement_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
