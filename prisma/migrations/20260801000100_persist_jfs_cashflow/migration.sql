CREATE TYPE "JfsCashflowTrigger" AS ENUM ('MANUAL', 'CRON');

CREATE TABLE "JfsCashflowSyncRun" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "triggerSource" "JfsCashflowTrigger" NOT NULL,
    "status" "SyncRunStatus" NOT NULL DEFAULT 'RUNNING',
    "fetchedCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "anomalyCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "requestId" TEXT NOT NULL,
    "errorCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "JfsCashflowSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JfsCashflowRecord" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "businessDate" DATE NOT NULL,
    "direction" TEXT NOT NULL,
    "transactionType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "sourceReference" TEXT,
    "sourceRecordKey" TEXT NOT NULL,
    "sourcePayloadHash" TEXT NOT NULL,
    "firstSeenRunId" UUID NOT NULL,
    "lastSeenRunId" UUID NOT NULL,
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "JfsCashflowRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "JfsCashflowRecord_amount_non_negative" CHECK ("amount" >= 0)
);

CREATE TABLE "JfsCashflowSyncLock" (
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "businessDate" DATE NOT NULL,
    "requestId" TEXT NOT NULL,
    "acquiredAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "JfsCashflowSyncLock_pkey" PRIMARY KEY ("tenantId", "outletId", "businessDate")
);

CREATE UNIQUE INDEX "JfsCashflowSyncRun_requestId_key" ON "JfsCashflowSyncRun"("requestId");
CREATE INDEX "JfsCashflowSyncRun_tenantId_outletId_startedAt_idx" ON "JfsCashflowSyncRun"("tenantId", "outletId", "startedAt");
CREATE INDEX "JfsCashflowSyncRun_tenantId_outletId_periodStart_periodEnd_idx" ON "JfsCashflowSyncRun"("tenantId", "outletId", "periodStart", "periodEnd");
CREATE INDEX "JfsCashflowSyncRun_status_idx" ON "JfsCashflowSyncRun"("status");
CREATE UNIQUE INDEX "JfsCashflowRecord_tenantId_outletId_sourceRecordKey_key" ON "JfsCashflowRecord"("tenantId", "outletId", "sourceRecordKey");
CREATE INDEX "JfsCashflowRecord_tenantId_outletId_businessDate_idx" ON "JfsCashflowRecord"("tenantId", "outletId", "businessDate");
CREATE INDEX "JfsCashflowRecord_tenantId_outletId_direction_businessDate_idx" ON "JfsCashflowRecord"("tenantId", "outletId", "direction", "businessDate");
CREATE INDEX "JfsCashflowSyncLock_requestId_idx" ON "JfsCashflowSyncLock"("requestId");

ALTER TABLE "JfsCashflowSyncRun" ADD CONSTRAINT "JfsCashflowSyncRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JfsCashflowSyncRun" ADD CONSTRAINT "JfsCashflowSyncRun_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JfsCashflowRecord" ADD CONSTRAINT "JfsCashflowRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JfsCashflowRecord" ADD CONSTRAINT "JfsCashflowRecord_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JfsCashflowRecord" ADD CONSTRAINT "JfsCashflowRecord_firstSeenRunId_fkey" FOREIGN KEY ("firstSeenRunId") REFERENCES "JfsCashflowSyncRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JfsCashflowRecord" ADD CONSTRAINT "JfsCashflowRecord_lastSeenRunId_fkey" FOREIGN KEY ("lastSeenRunId") REFERENCES "JfsCashflowSyncRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JfsCashflowSyncLock" ADD CONSTRAINT "JfsCashflowSyncLock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JfsCashflowSyncLock" ADD CONSTRAINT "JfsCashflowSyncLock_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
