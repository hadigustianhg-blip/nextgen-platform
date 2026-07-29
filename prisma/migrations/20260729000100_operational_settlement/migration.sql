CREATE TYPE "OperationalExpenseStatus" AS ENUM ('VALID', 'VOID');
CREATE TYPE "OperationalClosingStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "OperationalExpense" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "operationalDate" DATE NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "teamName" TEXT,
    "cashAdvanceCategory" TEXT,
    "vehiclePlate" TEXT,
    "status" "OperationalExpenseStatus" NOT NULL DEFAULT 'VALID',
    "createdByUserId" UUID NOT NULL,
    "updatedByUserId" UUID NOT NULL,
    "voidedByUserId" UUID,
    "voidedAt" TIMESTAMPTZ(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "OperationalExpense_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperationalClosing" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "operationalDate" DATE NOT NULL,
    "physicalCash" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "OperationalClosingStatus" NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "closedByUserId" UUID,
    "closedAt" TIMESTAMPTZ(3),
    "reopenedByUserId" UUID,
    "reopenedAt" TIMESTAMPTZ(3),
    "reopenReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "OperationalClosing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperationalActionRequest" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "requestKey" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entityId" TEXT,
    "response" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperationalActionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperationalExpense_tenantId_outletId_operationalDate_status_idx" ON "OperationalExpense"("tenantId", "outletId", "operationalDate", "status");
CREATE INDEX "OperationalExpense_tenantId_outletId_category_operationalDate_idx" ON "OperationalExpense"("tenantId", "outletId", "category", "operationalDate");
CREATE INDEX "OperationalExpense_tenantId_outletId_teamName_operationalDate_idx" ON "OperationalExpense"("tenantId", "outletId", "teamName", "operationalDate");
CREATE UNIQUE INDEX "OperationalClosing_tenantId_outletId_operationalDate_key" ON "OperationalClosing"("tenantId", "outletId", "operationalDate");
CREATE INDEX "OperationalClosing_tenantId_outletId_status_operationalDate_idx" ON "OperationalClosing"("tenantId", "outletId", "status", "operationalDate");
CREATE UNIQUE INDEX "OperationalActionRequest_tenantId_outletId_requestKey_key" ON "OperationalActionRequest"("tenantId", "outletId", "requestKey");
CREATE INDEX "OperationalActionRequest_tenantId_outletId_action_createdAt_idx" ON "OperationalActionRequest"("tenantId", "outletId", "action", "createdAt");

ALTER TABLE "OperationalExpense" ADD CONSTRAINT "OperationalExpense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OperationalExpense" ADD CONSTRAINT "OperationalExpense_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OperationalExpense" ADD CONSTRAINT "OperationalExpense_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OperationalExpense" ADD CONSTRAINT "OperationalExpense_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OperationalExpense" ADD CONSTRAINT "OperationalExpense_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OperationalClosing" ADD CONSTRAINT "OperationalClosing_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OperationalClosing" ADD CONSTRAINT "OperationalClosing_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OperationalClosing" ADD CONSTRAINT "OperationalClosing_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OperationalClosing" ADD CONSTRAINT "OperationalClosing_reopenedByUserId_fkey" FOREIGN KEY ("reopenedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OperationalActionRequest" ADD CONSTRAINT "OperationalActionRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OperationalActionRequest" ADD CONSTRAINT "OperationalActionRequest_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
