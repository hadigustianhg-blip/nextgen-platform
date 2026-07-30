CREATE TYPE "InvoiceStatus" AS ENUM (
  'DRAFT',
  'ISSUED',
  'SENT',
  'PARTIALLY_PAID',
  'PAID',
  'CANCELLED',
  'VOID'
);

CREATE TABLE "Invoice" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "invoiceNumber" TEXT,
  "customerKey" TEXT NOT NULL,
  "customerNameSnapshot" TEXT NOT NULL,
  "companyNameSnapshot" TEXT,
  "whatsappSnapshot" TEXT,
  "emailSnapshot" TEXT,
  "addressSnapshot" TEXT,
  "invoiceDate" DATE NOT NULL,
  "dueDate" DATE NOT NULL,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "subtotal" DECIMAL(18,2) NOT NULL,
  "discountTotal" DECIMAL(18,2) NOT NULL,
  "grandTotal" DECIMAL(18,2) NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "issuedAt" TIMESTAMPTZ(3),
  "sentAt" TIMESTAMPTZ(3),
  "paidAt" TIMESTAMPTZ(3),
  "voidedAt" TIMESTAMPTZ(3),
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceItem" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "invoiceId" UUID NOT NULL,
  "masterPickupId" UUID NOT NULL,
  "pickupSettlementRevisionId" UUID,
  "activeLockKey" TEXT,
  "waybillNumber" TEXT NOT NULL,
  "transactionDate" DATE NOT NULL,
  "pickupStaff" TEXT,
  "sellerNameSnapshot" TEXT NOT NULL,
  "weight" DECIMAL(12,3) NOT NULL,
  "freightAmount" DECIMAL(18,2) NOT NULL,
  "discountAmount" DECIMAL(18,2) NOT NULL,
  "finalAmount" DECIMAL(18,2) NOT NULL,
  "obligationAmount" DECIMAL(18,2) NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceSequence" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "lastValue" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutletBankAccount" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "bankName" TEXT NOT NULL,
  "accountNumber" TEXT NOT NULL,
  "accountHolder" TEXT NOT NULL,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "OutletBankAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invoice_tenantId_outletId_invoiceNumber_key"
  ON "Invoice"("tenantId", "outletId", "invoiceNumber");
CREATE INDEX "Invoice_tenantId_outletId_status_invoiceDate_idx"
  ON "Invoice"("tenantId", "outletId", "status", "invoiceDate");
CREATE INDEX "Invoice_tenantId_outletId_customerKey_periodStart_periodEnd_idx"
  ON "Invoice"("tenantId", "outletId", "customerKey", "periodStart", "periodEnd");
CREATE UNIQUE INDEX "InvoiceItem_activeLockKey_key" ON "InvoiceItem"("activeLockKey");
CREATE UNIQUE INDEX "InvoiceItem_invoiceId_masterPickupId_key"
  ON "InvoiceItem"("invoiceId", "masterPickupId");
CREATE INDEX "InvoiceItem_tenantId_outletId_masterPickupId_idx"
  ON "InvoiceItem"("tenantId", "outletId", "masterPickupId");
CREATE INDEX "InvoiceItem_tenantId_outletId_invoiceId_idx"
  ON "InvoiceItem"("tenantId", "outletId", "invoiceId");
CREATE UNIQUE INDEX "InvoiceSequence_tenantId_outletId_year_month_key"
  ON "InvoiceSequence"("tenantId", "outletId", "year", "month");
CREATE INDEX "OutletBankAccount_tenantId_outletId_isActive_displayOrder_idx"
  ON "OutletBankAccount"("tenantId", "outletId", "isActive", "displayOrder");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_outletId_fkey"
  FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_outletId_fkey"
  FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_masterPickupId_fkey"
  FOREIGN KEY ("masterPickupId") REFERENCES "MasterPickup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceSequence" ADD CONSTRAINT "InvoiceSequence_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceSequence" ADD CONSTRAINT "InvoiceSequence_outletId_fkey"
  FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutletBankAccount" ADD CONSTRAINT "OutletBankAccount_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutletBankAccount" ADD CONSTRAINT "OutletBankAccount_outletId_fkey"
  FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
