ALTER TABLE "Tenant"
  ADD COLUMN "address" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "email" TEXT;

ALTER TABLE "Outlet"
  ADD COLUMN "address" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "email" TEXT;

CREATE TYPE "FinancialCategoryType" AS ENUM ('INCOME', 'EXPENSE');

CREATE TABLE "FinancialCategory" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "canonicalName" TEXT NOT NULL,
  "type" "FinancialCategoryType" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "FinancialCategory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinancialCategory_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FinancialCategory_tenantId_outletId_type_canonicalName_key"
  ON "FinancialCategory"("tenantId", "outletId", "type", "canonicalName");

CREATE INDEX "FinancialCategory_tenantId_outletId_type_isActive_sortOrder_idx"
  ON "FinancialCategory"("tenantId", "outletId", "type", "isActive", "sortOrder");
