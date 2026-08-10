-- CreateEnum
CREATE TYPE "IntegrationConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'FAILED');

-- DropIndex (old initial foundation constraints if present)
DROP INDEX IF EXISTS "IntegrationCredential_tenantId_provider_label_key";
DROP INDEX IF EXISTS "IntegrationCredential_tenantId_provider_isActive_idx";

-- AlterTable (additive columns for self-service per-outlet credentials)
ALTER TABLE "IntegrationCredential"
    ADD COLUMN "outletId" UUID,
    ADD COLUMN "accountEncrypted" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "passwordEncrypted" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "networkCode" TEXT,
    ADD COLUMN "networkName" TEXT,
    ADD COLUMN "financeCode" TEXT,
    ADD COLUMN "financeId" INTEGER,
    ADD COLUMN "scanSiteCode" TEXT,
    ADD COLUMN "connectionStatus" "IntegrationConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    ADD COLUMN "lastConnectedAt" TIMESTAMP(3),
    ADD COLUMN "lastTestedAt" TIMESTAMP(3),
    ADD COLUMN "lastFailureAt" TIMESTAMP(3),
    ADD COLUMN "lastFailureCode" TEXT,
    ALTER COLUMN "label" DROP NOT NULL,
    ALTER COLUMN "encryptedPayload" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "IntegrationCredential" ADD CONSTRAINT "IntegrationCredential_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationCredential_tenantId_outletId_provider_key" ON "IntegrationCredential"("tenantId", "outletId", "provider");
CREATE INDEX "IntegrationCredential_tenantId_outletId_provider_isActive_idx" ON "IntegrationCredential"("tenantId", "outletId", "provider", "isActive");
