ALTER TABLE "Tenant"
  ADD COLUMN "adminWhatsapp" TEXT;

ALTER TABLE "Outlet"
  ADD COLUMN "adminWhatsapp" TEXT;

ALTER TABLE "Invoice"
  ADD COLUMN "paymentContactPhone" TEXT,
  ADD COLUMN "voidReason" TEXT;
