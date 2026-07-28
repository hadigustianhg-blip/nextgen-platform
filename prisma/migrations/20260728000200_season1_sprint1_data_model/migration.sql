-- CreateEnum
CREATE TYPE "RawSyncStatus" AS ENUM ('FETCHED', 'NORMALIZED', 'ERROR');

-- CreateEnum
CREATE TYPE "FinancialRecordStatus" AS ENUM ('VALID', 'SUPERSEDED', 'VOID');

-- CreateEnum
CREATE TYPE "ObligationReviewDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SyncRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncRunType" AS ENUM ('FULL', 'PICKUP', 'DISPATCH', 'COD');

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "runType" "SyncRunType" NOT NULL,
    "operationalDate" DATE NOT NULL,
    "status" "SyncRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "triggeredByUserId" UUID,
    "pickupFetchedCount" INTEGER NOT NULL DEFAULT 0,
    "pickupCreatedCount" INTEGER NOT NULL DEFAULT 0,
    "pickupUpdatedCount" INTEGER NOT NULL DEFAULT 0,
    "dispatchFetchedCount" INTEGER NOT NULL DEFAULT 0,
    "dispatchCreatedCount" INTEGER NOT NULL DEFAULT 0,
    "dispatchUpdatedCount" INTEGER NOT NULL DEFAULT 0,
    "codFetchedCount" INTEGER NOT NULL DEFAULT 0,
    "codCreatedCount" INTEGER NOT NULL DEFAULT 0,
    "codUpdatedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "anomalyCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawPickup" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "operationalDate" DATE NOT NULL,
    "sourceEndpoint" TEXT NOT NULL,
    "sourceRecordKey" TEXT NOT NULL,
    "sourceFetchedAt" TIMESTAMPTZ(3) NOT NULL,
    "syncedAt" TIMESTAMPTZ(3),
    "syncStatus" "RawSyncStatus" NOT NULL DEFAULT 'FETCHED',
    "syncError" TEXT,
    "sourceRecordHash" CHAR(64) NOT NULL,
    "sourcePayload" JSONB NOT NULL,
    "firstSeenRunId" UUID NOT NULL,
    "lastSeenRunId" UUID NOT NULL,
    "waybillNo" TEXT NOT NULL,
    "pickNetwork" TEXT,
    "destination" TEXT,
    "settlementRaw" TEXT,
    "totalFreight" DECIMAL(18,2) NOT NULL,
    "freight" DECIMAL(18,2) NOT NULL,
    "weight" DECIMAL(12,3) NOT NULL,
    "staffNameRaw" TEXT,
    "senderName" TEXT,
    "serviceRaw" TEXT,
    "receiverName" TEXT,
    "receiverAddress" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RawPickup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawDispatch" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "operationalDate" DATE NOT NULL,
    "sourceEndpoint" TEXT NOT NULL,
    "sourceRecordKey" TEXT NOT NULL,
    "sourceFetchedAt" TIMESTAMPTZ(3) NOT NULL,
    "syncedAt" TIMESTAMPTZ(3),
    "syncStatus" "RawSyncStatus" NOT NULL DEFAULT 'FETCHED',
    "syncError" TEXT,
    "sourceRecordHash" CHAR(64) NOT NULL,
    "sourcePayload" JSONB NOT NULL,
    "firstSeenRunId" UUID NOT NULL,
    "lastSeenRunId" UUID NOT NULL,
    "waybillNo" TEXT NOT NULL,
    "courierNameRaw" TEXT,
    "freightAmount" DECIMAL(18,2) NOT NULL,
    "dispatchTimeRaw" TEXT,
    "dispatchAt" TIMESTAMPTZ(3),
    "receiverName" TEXT,
    "receiverAddress" TEXT,
    "deliveryStatusRaw" TEXT,
    "chargeWeight" DECIMAL(12,3) NOT NULL,
    "settlementTypeRaw" TEXT,
    "serviceRaw" TEXT,
    "codStatusRaw" TEXT,
    "codValue" DECIMAL(18,2) NOT NULL,
    "goodsDescription" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RawDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawCod" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "operationalDate" DATE NOT NULL,
    "sourceEndpoint" TEXT NOT NULL,
    "sourceRecordKey" TEXT NOT NULL,
    "sourceFetchedAt" TIMESTAMPTZ(3) NOT NULL,
    "syncedAt" TIMESTAMPTZ(3),
    "syncStatus" "RawSyncStatus" NOT NULL DEFAULT 'FETCHED',
    "syncError" TEXT,
    "sourceRecordHash" CHAR(64) NOT NULL,
    "sourcePayload" JSONB NOT NULL,
    "firstSeenRunId" UUID NOT NULL,
    "lastSeenRunId" UUID NOT NULL,
    "waybillNo" TEXT NOT NULL,
    "codAmount" DECIMAL(18,2) NOT NULL,
    "repaymentStatusRaw" JSONB NOT NULL,
    "repaymentStatusCode" INTEGER,
    "repaymentTypeRaw" JSONB NOT NULL,
    "repaymentTypeCode" INTEGER,
    "repaymentTypeLabel" TEXT,
    "signTimeRaw" TEXT,
    "signedAt" TIMESTAMPTZ(3),
    "courierNameRaw" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RawCod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterPickup" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "rawPickupId" UUID NOT NULL,
    "operationalDate" DATE NOT NULL,
    "waybillNo" TEXT NOT NULL,
    "staffName" TEXT,
    "senderName" TEXT,
    "freightAmount" DECIMAL(18,2) NOT NULL,
    "syncStatus" "RawSyncStatus" NOT NULL DEFAULT 'NORMALIZED',
    "normalizationVersion" INTEGER NOT NULL DEFAULT 1,
    "sourceSyncedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MasterPickup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupSettlementRevision" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "masterPickupId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "recordStatus" "FinancialRecordStatus" NOT NULL DEFAULT 'VALID',
    "supersedesRevisionId" UUID,
    "discountAmount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT,
    "voidedAt" TIMESTAMPTZ(3),
    "voidedByUserId" UUID,
    "voidReason" TEXT,
    "createdByUserId" UUID NOT NULL,
    "updatedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PickupSettlementRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupPayment" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "masterPickupId" UUID NOT NULL,
    "transactionKey" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "recordStatus" "FinancialRecordStatus" NOT NULL DEFAULT 'VALID',
    "supersedesPaymentId" UUID,
    "paymentDate" DATE NOT NULL,
    "receivedAmount" DECIMAL(18,2) NOT NULL,
    "paymentMethodRaw" TEXT NOT NULL,
    "transferAccount" TEXT,
    "note" TEXT,
    "voidedAt" TIMESTAMPTZ(3),
    "voidedByUserId" UUID,
    "voidReason" TEXT,
    "createdByUserId" UUID NOT NULL,
    "updatedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PickupPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterSetoran" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "operationalDate" DATE NOT NULL,
    "courierKey" TEXT NOT NULL,
    "courierName" TEXT NOT NULL,
    "dfodAmount" DECIMAL(18,2) NOT NULL,
    "codCashAmount" DECIMAL(18,2) NOT NULL,
    "codQrisAmount" DECIMAL(18,2) NOT NULL,
    "totalSettlementAmount" DECIMAL(18,2) NOT NULL,
    "previousObligationAmount" DECIMAL(18,2),
    "proposedDfodAmount" DECIMAL(18,2),
    "proposedCodCashAmount" DECIMAL(18,2),
    "proposedCodQrisAmount" DECIMAL(18,2),
    "proposedObligationAmount" DECIMAL(18,2),
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "obligationVersion" INTEGER NOT NULL DEFAULT 1,
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewDecision" "ObligationReviewDecision",
    "reviewNote" TEXT,
    "syncStatus" "RawSyncStatus" NOT NULL DEFAULT 'NORMALIZED',
    "normalizationVersion" INTEGER NOT NULL DEFAULT 1,
    "sourceFetchedFrom" TIMESTAMPTZ(3) NOT NULL,
    "sourceFetchedTo" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MasterSetoran_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierSettlementPayment" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "masterSetoranId" UUID NOT NULL,
    "transactionKey" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "recordStatus" "FinancialRecordStatus" NOT NULL DEFAULT 'VALID',
    "supersedesPaymentId" UUID,
    "paymentDate" DATE NOT NULL,
    "cashAmount" DECIMAL(18,2) NOT NULL,
    "transferAmountSnapshot" DECIMAL(18,2) NOT NULL,
    "paidAmountSnapshot" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "overpaymentConfirmedAt" TIMESTAMPTZ(3),
    "overpaymentConfirmedByUserId" UUID,
    "voidedAt" TIMESTAMPTZ(3),
    "voidedByUserId" UUID,
    "voidReason" TEXT,
    "createdByUserId" UUID NOT NULL,
    "updatedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CourierSettlementPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierSettlementTransfer" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "settlementPaymentId" UUID NOT NULL,
    "transactionKey" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "recordStatus" "FinancialRecordStatus" NOT NULL DEFAULT 'VALID',
    "supersedesTransferId" UUID,
    "amount" DECIMAL(18,2) NOT NULL,
    "destinationAccount" TEXT,
    "bankName" TEXT,
    "referenceNumber" TEXT,
    "transferredAt" TIMESTAMPTZ(3),
    "note" TEXT,
    "createdByUserId" UUID NOT NULL,
    "updatedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CourierSettlementTransfer_pkey" PRIMARY KEY ("id")
);

-- Season 1 domain constraints
ALTER TABLE "SyncRun"
    ADD CONSTRAINT "SyncRun_counts_nonnegative_check"
    CHECK (
        "pickupFetchedCount" >= 0
        AND "pickupCreatedCount" >= 0
        AND "pickupUpdatedCount" >= 0
        AND "dispatchFetchedCount" >= 0
        AND "dispatchCreatedCount" >= 0
        AND "dispatchUpdatedCount" >= 0
        AND "codFetchedCount" >= 0
        AND "codCreatedCount" >= 0
        AND "codUpdatedCount" >= 0
        AND "duplicateCount" >= 0
        AND "anomalyCount" >= 0
    ),
    ADD CONSTRAINT "SyncRun_completion_check"
    CHECK (
        ("status" = 'RUNNING' AND "completedAt" IS NULL)
        OR ("status" <> 'RUNNING' AND "completedAt" IS NOT NULL)
    ),
    ADD CONSTRAINT "SyncRun_time_order_check"
    CHECK ("completedAt" IS NULL OR "completedAt" >= "startedAt");

ALTER TABLE "RawPickup"
    ADD CONSTRAINT "RawPickup_amounts_nonnegative_check"
    CHECK ("totalFreight" >= 0 AND "freight" >= 0 AND "weight" >= 0);

ALTER TABLE "RawDispatch"
    ADD CONSTRAINT "RawDispatch_amounts_nonnegative_check"
    CHECK ("freightAmount" >= 0 AND "chargeWeight" >= 0 AND "codValue" >= 0);

ALTER TABLE "RawCod"
    ADD CONSTRAINT "RawCod_amount_nonnegative_check"
    CHECK ("codAmount" >= 0);

ALTER TABLE "MasterPickup"
    ADD CONSTRAINT "MasterPickup_freight_nonnegative_check"
    CHECK ("freightAmount" >= 0),
    ADD CONSTRAINT "MasterPickup_normalization_version_check"
    CHECK ("normalizationVersion" >= 1);

ALTER TABLE "PickupSettlementRevision"
    ADD CONSTRAINT "PickupSettlementRevision_revision_check"
    CHECK ("revision" >= 1),
    ADD CONSTRAINT "PickupSettlementRevision_discount_nonnegative_check"
    CHECK ("discountAmount" >= 0);

ALTER TABLE "PickupPayment"
    ADD CONSTRAINT "PickupPayment_revision_check"
    CHECK ("revision" >= 1),
    ADD CONSTRAINT "PickupPayment_received_amount_nonnegative_check"
    CHECK ("receivedAmount" >= 0);

ALTER TABLE "MasterSetoran"
    ADD CONSTRAINT "MasterSetoran_amounts_nonnegative_check"
    CHECK (
        "dfodAmount" >= 0
        AND "codCashAmount" >= 0
        AND "codQrisAmount" >= 0
        AND "totalSettlementAmount" >= 0
        AND ("previousObligationAmount" IS NULL OR "previousObligationAmount" >= 0)
        AND ("proposedDfodAmount" IS NULL OR "proposedDfodAmount" >= 0)
        AND ("proposedCodCashAmount" IS NULL OR "proposedCodCashAmount" >= 0)
        AND ("proposedCodQrisAmount" IS NULL OR "proposedCodQrisAmount" >= 0)
        AND ("proposedObligationAmount" IS NULL OR "proposedObligationAmount" >= 0)
    ),
    ADD CONSTRAINT "MasterSetoran_total_formula_check"
    CHECK ("totalSettlementAmount" = "dfodAmount" + "codCashAmount"),
    ADD CONSTRAINT "MasterSetoran_version_check"
    CHECK ("obligationVersion" >= 1 AND "normalizationVersion" >= 1),
    ADD CONSTRAINT "MasterSetoran_source_window_check"
    CHECK ("sourceFetchedFrom" <= "sourceFetchedTo");

ALTER TABLE "CourierSettlementPayment"
    ADD CONSTRAINT "CourierSettlementPayment_revision_check"
    CHECK ("revision" >= 1),
    ADD CONSTRAINT "CourierSettlementPayment_amounts_nonnegative_check"
    CHECK (
        "cashAmount" >= 0
        AND "transferAmountSnapshot" >= 0
        AND "paidAmountSnapshot" >= 0
    ),
    ADD CONSTRAINT "CourierSettlementPayment_snapshot_formula_check"
    CHECK ("paidAmountSnapshot" = "cashAmount" + "transferAmountSnapshot");

ALTER TABLE "CourierSettlementTransfer"
    ADD CONSTRAINT "CourierSettlementTransfer_revision_check"
    CHECK ("revision" >= 1),
    ADD CONSTRAINT "CourierSettlementTransfer_amount_nonnegative_check"
    CHECK ("amount" >= 0),
    ADD CONSTRAINT "CourierSettlementTransfer_sequence_check"
    CHECK ("sequence" BETWEEN 1 AND 8);

-- CreateIndex
CREATE INDEX "SyncRun_tenantId_outletId_startedAt_idx" ON "SyncRun"("tenantId", "outletId", "startedAt");

-- CreateIndex
CREATE INDEX "SyncRun_tenantId_outletId_operationalDate_idx" ON "SyncRun"("tenantId", "outletId", "operationalDate");

-- CreateIndex
CREATE INDEX "SyncRun_status_idx" ON "SyncRun"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SyncRun_tenantId_outletId_id_key" ON "SyncRun"("tenantId", "outletId", "id");

-- CreateIndex
CREATE INDEX "RawPickup_tenantId_outletId_operationalDate_idx" ON "RawPickup"("tenantId", "outletId", "operationalDate");

-- CreateIndex
CREATE INDEX "RawPickup_tenantId_outletId_waybillNo_idx" ON "RawPickup"("tenantId", "outletId", "waybillNo");

-- CreateIndex
CREATE INDEX "RawPickup_tenantId_outletId_syncStatus_idx" ON "RawPickup"("tenantId", "outletId", "syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "RawPickup_tenantId_outletId_sourceRecordKey_key" ON "RawPickup"("tenantId", "outletId", "sourceRecordKey");

-- CreateIndex
CREATE INDEX "RawPickup_firstSeenRunId_idx" ON "RawPickup"("firstSeenRunId");

-- CreateIndex
CREATE INDEX "RawPickup_lastSeenRunId_idx" ON "RawPickup"("lastSeenRunId");

-- CreateIndex
CREATE INDEX "RawDispatch_tenantId_outletId_operationalDate_idx" ON "RawDispatch"("tenantId", "outletId", "operationalDate");

-- CreateIndex
CREATE INDEX "RawDispatch_tenantId_outletId_waybillNo_idx" ON "RawDispatch"("tenantId", "outletId", "waybillNo");

-- CreateIndex
CREATE INDEX "RawDispatch_tenantId_outletId_courierNameRaw_operationalDat_idx" ON "RawDispatch"("tenantId", "outletId", "courierNameRaw", "operationalDate");

-- CreateIndex
CREATE INDEX "RawDispatch_tenantId_outletId_syncStatus_idx" ON "RawDispatch"("tenantId", "outletId", "syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "RawDispatch_tenantId_outletId_sourceRecordKey_key" ON "RawDispatch"("tenantId", "outletId", "sourceRecordKey");

-- CreateIndex
CREATE INDEX "RawDispatch_firstSeenRunId_idx" ON "RawDispatch"("firstSeenRunId");

-- CreateIndex
CREATE INDEX "RawDispatch_lastSeenRunId_idx" ON "RawDispatch"("lastSeenRunId");

-- CreateIndex
CREATE INDEX "RawCod_tenantId_outletId_operationalDate_idx" ON "RawCod"("tenantId", "outletId", "operationalDate");

-- CreateIndex
CREATE INDEX "RawCod_tenantId_outletId_waybillNo_idx" ON "RawCod"("tenantId", "outletId", "waybillNo");

-- CreateIndex
CREATE INDEX "RawCod_tenantId_outletId_courierNameRaw_operationalDate_idx" ON "RawCod"("tenantId", "outletId", "courierNameRaw", "operationalDate");

-- CreateIndex
CREATE INDEX "RawCod_tenantId_outletId_syncStatus_idx" ON "RawCod"("tenantId", "outletId", "syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "RawCod_tenantId_outletId_sourceRecordKey_key" ON "RawCod"("tenantId", "outletId", "sourceRecordKey");

-- CreateIndex
CREATE INDEX "RawCod_firstSeenRunId_idx" ON "RawCod"("firstSeenRunId");

-- CreateIndex
CREATE INDEX "RawCod_lastSeenRunId_idx" ON "RawCod"("lastSeenRunId");

-- CreateIndex
CREATE UNIQUE INDEX "MasterPickup_rawPickupId_key" ON "MasterPickup"("rawPickupId");

-- CreateIndex
CREATE INDEX "MasterPickup_tenantId_outletId_operationalDate_idx" ON "MasterPickup"("tenantId", "outletId", "operationalDate");

-- CreateIndex
CREATE INDEX "MasterPickup_tenantId_outletId_staffName_operationalDate_idx" ON "MasterPickup"("tenantId", "outletId", "staffName", "operationalDate");

-- CreateIndex
CREATE UNIQUE INDEX "MasterPickup_tenantId_outletId_waybillNo_key" ON "MasterPickup"("tenantId", "outletId", "waybillNo");

-- CreateIndex
CREATE INDEX "PickupSettlementRevision_tenantId_outletId_masterPickupId_r_idx" ON "PickupSettlementRevision"("tenantId", "outletId", "masterPickupId", "recordStatus");

-- CreateIndex
CREATE UNIQUE INDEX "PickupSettlementRevision_masterPickupId_revision_key" ON "PickupSettlementRevision"("masterPickupId", "revision");

-- CreateIndex
CREATE INDEX "PickupPayment_tenantId_outletId_paymentDate_idx" ON "PickupPayment"("tenantId", "outletId", "paymentDate");

-- CreateIndex
CREATE INDEX "PickupPayment_tenantId_outletId_masterPickupId_recordStatus_idx" ON "PickupPayment"("tenantId", "outletId", "masterPickupId", "recordStatus");

-- CreateIndex
CREATE UNIQUE INDEX "PickupPayment_transactionKey_revision_key" ON "PickupPayment"("transactionKey", "revision");

-- CreateIndex
CREATE INDEX "MasterSetoran_tenantId_outletId_operationalDate_idx" ON "MasterSetoran"("tenantId", "outletId", "operationalDate");

-- CreateIndex
CREATE INDEX "MasterSetoran_tenantId_outletId_courierName_operationalDate_idx" ON "MasterSetoran"("tenantId", "outletId", "courierName", "operationalDate");

-- CreateIndex
CREATE UNIQUE INDEX "MasterSetoran_tenantId_outletId_operationalDate_courierKey_key" ON "MasterSetoran"("tenantId", "outletId", "operationalDate", "courierKey");

-- CreateIndex
CREATE INDEX "CourierSettlementPayment_tenantId_outletId_masterSetoranId__idx" ON "CourierSettlementPayment"("tenantId", "outletId", "masterSetoranId", "recordStatus");

-- CreateIndex
CREATE INDEX "CourierSettlementPayment_tenantId_outletId_paymentDate_idx" ON "CourierSettlementPayment"("tenantId", "outletId", "paymentDate");

-- CreateIndex
CREATE UNIQUE INDEX "CourierSettlementPayment_transactionKey_revision_key" ON "CourierSettlementPayment"("transactionKey", "revision");

-- CreateIndex
CREATE INDEX "CourierSettlementTransfer_tenantId_outletId_settlementPayme_idx" ON "CourierSettlementTransfer"("tenantId", "outletId", "settlementPaymentId", "sequence", "recordStatus");

-- CreateIndex
CREATE INDEX "CourierSettlementTransfer_tenantId_outletId_referenceNumber_idx" ON "CourierSettlementTransfer"("tenantId", "outletId", "referenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CourierSettlementTransfer_transactionKey_revision_key" ON "CourierSettlementTransfer"("transactionKey", "revision");

-- Partial unique indexes enforce one active revision without deleting history.
CREATE UNIQUE INDEX "PickupSettlementRevision_one_valid_per_master_key"
ON "PickupSettlementRevision"("masterPickupId")
WHERE "recordStatus" = 'VALID';

CREATE UNIQUE INDEX "PickupPayment_one_valid_per_transaction_key"
ON "PickupPayment"("transactionKey")
WHERE "recordStatus" = 'VALID';

CREATE UNIQUE INDEX "CourierSettlementPayment_one_valid_per_transaction_key"
ON "CourierSettlementPayment"("transactionKey")
WHERE "recordStatus" = 'VALID';

CREATE UNIQUE INDEX "CourierSettlementTransfer_one_valid_per_transaction_key"
ON "CourierSettlementTransfer"("transactionKey")
WHERE "recordStatus" = 'VALID';

CREATE UNIQUE INDEX "CourierSettlementTransfer_one_valid_sequence_per_payment_key"
ON "CourierSettlementTransfer"("settlementPaymentId", "sequence")
WHERE "recordStatus" = 'VALID';

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_triggeredByUserId_fkey" FOREIGN KEY ("triggeredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawPickup" ADD CONSTRAINT "RawPickup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawPickup" ADD CONSTRAINT "RawPickup_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawPickup" ADD CONSTRAINT "RawPickup_firstSeenRun_fkey" FOREIGN KEY ("tenantId", "outletId", "firstSeenRunId") REFERENCES "SyncRun"("tenantId", "outletId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawPickup" ADD CONSTRAINT "RawPickup_lastSeenRun_fkey" FOREIGN KEY ("tenantId", "outletId", "lastSeenRunId") REFERENCES "SyncRun"("tenantId", "outletId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawDispatch" ADD CONSTRAINT "RawDispatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawDispatch" ADD CONSTRAINT "RawDispatch_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawDispatch" ADD CONSTRAINT "RawDispatch_firstSeenRun_fkey" FOREIGN KEY ("tenantId", "outletId", "firstSeenRunId") REFERENCES "SyncRun"("tenantId", "outletId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawDispatch" ADD CONSTRAINT "RawDispatch_lastSeenRun_fkey" FOREIGN KEY ("tenantId", "outletId", "lastSeenRunId") REFERENCES "SyncRun"("tenantId", "outletId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawCod" ADD CONSTRAINT "RawCod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawCod" ADD CONSTRAINT "RawCod_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawCod" ADD CONSTRAINT "RawCod_firstSeenRun_fkey" FOREIGN KEY ("tenantId", "outletId", "firstSeenRunId") REFERENCES "SyncRun"("tenantId", "outletId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawCod" ADD CONSTRAINT "RawCod_lastSeenRun_fkey" FOREIGN KEY ("tenantId", "outletId", "lastSeenRunId") REFERENCES "SyncRun"("tenantId", "outletId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterPickup" ADD CONSTRAINT "MasterPickup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterPickup" ADD CONSTRAINT "MasterPickup_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterPickup" ADD CONSTRAINT "MasterPickup_rawPickupId_fkey" FOREIGN KEY ("rawPickupId") REFERENCES "RawPickup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupSettlementRevision" ADD CONSTRAINT "PickupSettlementRevision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupSettlementRevision" ADD CONSTRAINT "PickupSettlementRevision_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupSettlementRevision" ADD CONSTRAINT "PickupSettlementRevision_masterPickupId_fkey" FOREIGN KEY ("masterPickupId") REFERENCES "MasterPickup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupSettlementRevision" ADD CONSTRAINT "PickupSettlementRevision_supersedesRevisionId_fkey" FOREIGN KEY ("supersedesRevisionId") REFERENCES "PickupSettlementRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupSettlementRevision" ADD CONSTRAINT "PickupSettlementRevision_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupSettlementRevision" ADD CONSTRAINT "PickupSettlementRevision_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupSettlementRevision" ADD CONSTRAINT "PickupSettlementRevision_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupPayment" ADD CONSTRAINT "PickupPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupPayment" ADD CONSTRAINT "PickupPayment_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupPayment" ADD CONSTRAINT "PickupPayment_masterPickupId_fkey" FOREIGN KEY ("masterPickupId") REFERENCES "MasterPickup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupPayment" ADD CONSTRAINT "PickupPayment_supersedesPaymentId_fkey" FOREIGN KEY ("supersedesPaymentId") REFERENCES "PickupPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupPayment" ADD CONSTRAINT "PickupPayment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupPayment" ADD CONSTRAINT "PickupPayment_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupPayment" ADD CONSTRAINT "PickupPayment_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterSetoran" ADD CONSTRAINT "MasterSetoran_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterSetoran" ADD CONSTRAINT "MasterSetoran_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterSetoran" ADD CONSTRAINT "MasterSetoran_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierSettlementPayment" ADD CONSTRAINT "CourierSettlementPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierSettlementPayment" ADD CONSTRAINT "CourierSettlementPayment_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierSettlementPayment" ADD CONSTRAINT "CourierSettlementPayment_masterSetoranId_fkey" FOREIGN KEY ("masterSetoranId") REFERENCES "MasterSetoran"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierSettlementPayment" ADD CONSTRAINT "CourierSettlementPayment_supersedesPaymentId_fkey" FOREIGN KEY ("supersedesPaymentId") REFERENCES "CourierSettlementPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierSettlementPayment" ADD CONSTRAINT "CourierSettlementPayment_overpaymentConfirmedByUserId_fkey" FOREIGN KEY ("overpaymentConfirmedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierSettlementPayment" ADD CONSTRAINT "CourierSettlementPayment_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierSettlementPayment" ADD CONSTRAINT "CourierSettlementPayment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierSettlementPayment" ADD CONSTRAINT "CourierSettlementPayment_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierSettlementTransfer" ADD CONSTRAINT "CourierSettlementTransfer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierSettlementTransfer" ADD CONSTRAINT "CourierSettlementTransfer_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierSettlementTransfer" ADD CONSTRAINT "CourierSettlementTransfer_settlementPaymentId_fkey" FOREIGN KEY ("settlementPaymentId") REFERENCES "CourierSettlementPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierSettlementTransfer" ADD CONSTRAINT "CourierSettlementTransfer_supersedesTransferId_fkey" FOREIGN KEY ("supersedesTransferId") REFERENCES "CourierSettlementTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierSettlementTransfer" ADD CONSTRAINT "CourierSettlementTransfer_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierSettlementTransfer" ADD CONSTRAINT "CourierSettlementTransfer_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cross-row invariant: an active pickup discount cannot exceed its pickup freight.
CREATE FUNCTION "validate_pickup_discount_amount"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    pickup_freight DECIMAL(18,2);
BEGIN
    SELECT "freightAmount"
     INTO pickup_freight
      FROM "MasterPickup"
     WHERE "id" = NEW."masterPickupId"
     FOR UPDATE;

    IF pickup_freight IS NULL THEN
        RAISE EXCEPTION 'MasterPickup % does not exist', NEW."masterPickupId";
    END IF;

    IF NEW."discountAmount" > pickup_freight THEN
        RAISE EXCEPTION 'Pickup discount cannot exceed freight amount';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "PickupSettlementRevision_discount_not_above_freight_trg"
BEFORE INSERT OR UPDATE OF "discountAmount", "masterPickupId"
ON "PickupSettlementRevision"
FOR EACH ROW
EXECUTE FUNCTION "validate_pickup_discount_amount"();

CREATE FUNCTION "validate_master_pickup_freight_amount"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM "PickupSettlementRevision"
         WHERE "masterPickupId" = NEW."id"
           AND "recordStatus" = 'VALID'
           AND "discountAmount" > NEW."freightAmount"
    ) THEN
        RAISE EXCEPTION 'Pickup freight cannot be lower than its active discount';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "MasterPickup_freight_not_below_discount_trg"
BEFORE UPDATE OF "freightAmount"
ON "MasterPickup"
FOR EACH ROW
EXECUTE FUNCTION "validate_master_pickup_freight_amount"();

-- firstSeenRunId is immutable after the RAW row is created.
CREATE FUNCTION "protect_raw_first_seen_run"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW."firstSeenRunId" IS DISTINCT FROM OLD."firstSeenRunId" THEN
        RAISE EXCEPTION 'firstSeenRunId is immutable';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "RawPickup_first_seen_immutable_trg"
BEFORE UPDATE OF "firstSeenRunId"
ON "RawPickup"
FOR EACH ROW
EXECUTE FUNCTION "protect_raw_first_seen_run"();

CREATE TRIGGER "RawDispatch_first_seen_immutable_trg"
BEFORE UPDATE OF "firstSeenRunId"
ON "RawDispatch"
FOR EACH ROW
EXECUTE FUNCTION "protect_raw_first_seen_run"();

CREATE TRIGGER "RawCod_first_seen_immutable_trg"
BEFORE UPDATE OF "firstSeenRunId"
ON "RawCod"
FOR EACH ROW
EXECUTE FUNCTION "protect_raw_first_seen_run"();
