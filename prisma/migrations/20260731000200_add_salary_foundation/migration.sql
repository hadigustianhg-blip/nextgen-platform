CREATE TYPE "SalaryDivision" AS ENUM (
  'ADMIN', 'ADMIN_OPS', 'SALES', 'THREE_WHEEL_DRIVER', 'MOTORIST', 'DRIVER'
);
CREATE TYPE "SalaryEmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "SalaryProfileStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "SalaryAssignmentStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "SalaryClosingStatus" AS ENUM ('DRAFT', 'CLOSED', 'PROCESSED', 'PAID', 'VOID');
CREATE TYPE "SalaryClosingEmployeeStatus" AS ENUM ('DRAFT', 'REVIEWED', 'PROCESSED', 'PAID');
CREATE TYPE "SalaryComponentType" AS ENUM ('INCOME', 'DEDUCTION');
CREATE TYPE "SalaryComponentSourceType" AS ENUM (
  'BASIC', 'OVERTIME', 'FIXED_ALLOWANCE', 'DELIVERY_PER_KG',
  'DELIVERY_PER_WAYBILL', 'PICKUP_REGULAR_PERCENTAGE',
  'PICKUP_REGULAR_PER_WAYBILL', 'PICKUP_MARKETPLACE_PER_WAYBILL',
  'DAILY_FUEL', 'DAILY_EXTRA', 'MANUAL_ADDITION', 'MANUAL_DEDUCTION', 'OTHER'
);
CREATE TYPE "SalaryAdjustmentType" AS ENUM ('ADDITION', 'DEDUCTION');

CREATE TABLE "SalaryEmployee" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "division" "SalaryDivision" NOT NULL,
  "whatsapp" TEXT,
  "status" "SalaryEmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "SalaryEmployee_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalaryProfile" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "division" "SalaryDivision" NOT NULL,
  "description" TEXT,
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "SalaryProfileStatus" NOT NULL DEFAULT 'DRAFT',
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "SalaryProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalaryProfile_effective_period_check"
    CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
  CONSTRAINT "SalaryProfile_version_check" CHECK ("version" > 0)
);

CREATE TABLE "SalaryProfileSetting" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "salaryProfileId" UUID NOT NULL,
  "basicDailySalary" DECIMAL(18,2),
  "overtimeRate" DECIMAL(18,2),
  "fixedAllowance" DECIMAL(18,2),
  "deliveryPerKgAmount" DECIMAL(18,2),
  "deliveryPerKgMinWeight" DECIMAL(12,3),
  "deliveryPerKgMaxWeight" DECIMAL(12,3),
  "deliveryPerWaybillAmount" DECIMAL(18,2),
  "deliveryPerWaybillMinWeight" DECIMAL(12,3),
  "deliveryPerWaybillMaxWeight" DECIMAL(12,3),
  "pickupRegularRevenuePercentage" DECIMAL(7,4),
  "pickupRegularPerWaybillAmount" DECIMAL(18,2),
  "pickupMarketplacePerWaybillAmount" DECIMAL(18,2),
  "dailyFuelMinDeliveryWaybill" INTEGER,
  "dailyFuelAmount" DECIMAL(18,2),
  "dailyExtraMinDeliveryWaybill" INTEGER,
  "dailyExtraAmount" DECIMAL(18,2),
  "deliverySource" TEXT NOT NULL DEFAULT 'RAW_DISPATCH',
  "pickupSource" TEXT NOT NULL DEFAULT 'RAW_PICKUP',
  "dispatchRequiredStatus" TEXT NOT NULL DEFAULT 'Penerimaan Normal',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "SalaryProfileSetting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalaryProfileSetting_non_negative_check" CHECK (
    COALESCE("basicDailySalary", 0) >= 0 AND
    COALESCE("overtimeRate", 0) >= 0 AND
    COALESCE("fixedAllowance", 0) >= 0 AND
    COALESCE("deliveryPerKgAmount", 0) >= 0 AND
    COALESCE("deliveryPerKgMinWeight", 0) >= 0 AND
    COALESCE("deliveryPerKgMaxWeight", 0) >= 0 AND
    COALESCE("deliveryPerWaybillAmount", 0) >= 0 AND
    COALESCE("deliveryPerWaybillMinWeight", 0) >= 0 AND
    COALESCE("deliveryPerWaybillMaxWeight", 0) >= 0 AND
    COALESCE("pickupRegularRevenuePercentage", 0) BETWEEN 0 AND 100 AND
    COALESCE("pickupRegularPerWaybillAmount", 0) >= 0 AND
    COALESCE("pickupMarketplacePerWaybillAmount", 0) >= 0 AND
    COALESCE("dailyFuelMinDeliveryWaybill", 0) >= 0 AND
    COALESCE("dailyFuelAmount", 0) >= 0 AND
    COALESCE("dailyExtraMinDeliveryWaybill", 0) >= 0 AND
    COALESCE("dailyExtraAmount", 0) >= 0
  ),
  CONSTRAINT "SalaryProfileSetting_range_check" CHECK (
    ("deliveryPerKgMinWeight" IS NULL OR "deliveryPerKgMaxWeight" IS NULL OR
      "deliveryPerKgMaxWeight" >= "deliveryPerKgMinWeight") AND
    ("deliveryPerWaybillMinWeight" IS NULL OR "deliveryPerWaybillMaxWeight" IS NULL OR
      "deliveryPerWaybillMaxWeight" >= "deliveryPerWaybillMinWeight")
  )
);

CREATE TABLE "EmployeeSalaryAssignment" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "employeeId" UUID NOT NULL,
  "salaryProfileId" UUID NOT NULL,
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "status" "SalaryAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "EmployeeSalaryAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmployeeSalaryAssignment_period_check"
    CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom")
);

CREATE TABLE "SalaryClosing" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "closingNumber" TEXT NOT NULL,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "status" "SalaryClosingStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdByUserId" UUID NOT NULL,
  "closedByUserId" UUID,
  "processedByUserId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "closedAt" TIMESTAMPTZ(3),
  "processedAt" TIMESTAMPTZ(3),
  CONSTRAINT "SalaryClosing_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalaryClosing_period_check" CHECK ("periodEnd" >= "periodStart")
);

CREATE TABLE "SalaryClosingSequence" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "lastValue" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "SalaryClosingSequence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalaryClosingEmployee" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "salaryClosingId" UUID NOT NULL,
  "employeeId" UUID NOT NULL,
  "employeeNameSnapshot" TEXT NOT NULL,
  "divisionSnapshot" "SalaryDivision" NOT NULL,
  "whatsappSnapshot" TEXT,
  "salaryProfileId" UUID NOT NULL,
  "salaryProfileCodeSnapshot" TEXT NOT NULL,
  "salaryProfileVersionSnapshot" INTEGER NOT NULL,
  "systemIncomeTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "manualAdditionTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "manualDeductionTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "netSalary" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "status" "SalaryClosingEmployeeStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "SalaryClosingEmployee_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalaryClosingEmployee_totals_check" CHECK (
    "systemIncomeTotal" >= 0 AND "manualAdditionTotal" >= 0 AND
    "manualDeductionTotal" >= 0
  )
);

CREATE TABLE "SalaryClosingComponent" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "salaryClosingEmployeeId" UUID NOT NULL,
  "componentCode" TEXT NOT NULL,
  "componentName" TEXT NOT NULL,
  "componentType" "SalaryComponentType" NOT NULL,
  "sourceType" "SalaryComponentSourceType" NOT NULL,
  "quantity" DECIMAL(18,4),
  "rate" DECIMAL(18,4),
  "amount" DECIMAL(18,2) NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalaryClosingComponent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalaryClosingProfileSnapshot" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "salaryClosingId" UUID NOT NULL,
  "salaryProfileId" UUID NOT NULL,
  "profileCode" TEXT NOT NULL,
  "profileName" TEXT NOT NULL,
  "profileVersion" INTEGER NOT NULL,
  "division" "SalaryDivision" NOT NULL,
  "basicDailySalary" DECIMAL(18,2),
  "overtimeRate" DECIMAL(18,2),
  "fixedAllowance" DECIMAL(18,2),
  "deliveryPerKgAmount" DECIMAL(18,2),
  "deliveryPerKgMinWeight" DECIMAL(12,3),
  "deliveryPerKgMaxWeight" DECIMAL(12,3),
  "deliveryPerWaybillAmount" DECIMAL(18,2),
  "deliveryPerWaybillMinWeight" DECIMAL(12,3),
  "deliveryPerWaybillMaxWeight" DECIMAL(12,3),
  "pickupRegularRevenuePercentage" DECIMAL(7,4),
  "pickupRegularPerWaybillAmount" DECIMAL(18,2),
  "pickupMarketplacePerWaybillAmount" DECIMAL(18,2),
  "dailyFuelMinDeliveryWaybill" INTEGER,
  "dailyFuelAmount" DECIMAL(18,2),
  "dailyExtraMinDeliveryWaybill" INTEGER,
  "dailyExtraAmount" DECIMAL(18,2),
  "dispatchRequiredStatus" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalaryClosingProfileSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalaryAdjustment" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "outletId" UUID NOT NULL,
  "salaryClosingEmployeeId" UUID NOT NULL,
  "type" "SalaryAdjustmentType" NOT NULL,
  "category" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "voidedAt" TIMESTAMPTZ(3),
  "voidedByUserId" UUID,
  "voidReason" TEXT,
  CONSTRAINT "SalaryAdjustment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalaryAdjustment_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "SalaryAdjustment_reason_check" CHECK (char_length(trim("reason")) >= 5)
);

CREATE UNIQUE INDEX "SalaryEmployee_tenantId_outletId_name_key"
  ON "SalaryEmployee"("tenantId", "outletId", "name");
CREATE INDEX "SalaryEmployee_tenantId_outletId_division_status_idx"
  ON "SalaryEmployee"("tenantId", "outletId", "division", "status");
CREATE UNIQUE INDEX "SalaryProfile_tenantId_outletId_code_version_key"
  ON "SalaryProfile"("tenantId", "outletId", "code", "version");
CREATE INDEX "SalaryProfile_tenantId_outletId_division_status_effectiveFrom_idx"
  ON "SalaryProfile"("tenantId", "outletId", "division", "status", "effectiveFrom");
CREATE UNIQUE INDEX "SalaryProfileSetting_salaryProfileId_key"
  ON "SalaryProfileSetting"("salaryProfileId");
CREATE INDEX "SalaryProfileSetting_tenantId_outletId_idx"
  ON "SalaryProfileSetting"("tenantId", "outletId");
CREATE INDEX "EmployeeSalaryAssignment_tenantId_outletId_employeeId_status_effectiveFrom_effectiveTo_idx"
  ON "EmployeeSalaryAssignment"("tenantId", "outletId", "employeeId", "status", "effectiveFrom", "effectiveTo");
CREATE INDEX "EmployeeSalaryAssignment_tenantId_outletId_salaryProfileId_idx"
  ON "EmployeeSalaryAssignment"("tenantId", "outletId", "salaryProfileId");
CREATE UNIQUE INDEX "SalaryClosing_tenantId_outletId_closingNumber_key"
  ON "SalaryClosing"("tenantId", "outletId", "closingNumber");
CREATE INDEX "SalaryClosing_tenantId_outletId_status_periodStart_periodEnd_idx"
  ON "SalaryClosing"("tenantId", "outletId", "status", "periodStart", "periodEnd");
CREATE UNIQUE INDEX "SalaryClosingSequence_tenantId_outletId_year_month_key"
  ON "SalaryClosingSequence"("tenantId", "outletId", "year", "month");
CREATE UNIQUE INDEX "SalaryClosingEmployee_salaryClosingId_employeeId_key"
  ON "SalaryClosingEmployee"("salaryClosingId", "employeeId");
CREATE INDEX "SalaryClosingEmployee_tenantId_outletId_employeeId_idx"
  ON "SalaryClosingEmployee"("tenantId", "outletId", "employeeId");
CREATE INDEX "SalaryClosingComponent_tenantId_outletId_salaryClosingEmployeeId_idx"
  ON "SalaryClosingComponent"("tenantId", "outletId", "salaryClosingEmployeeId");
CREATE UNIQUE INDEX "SalaryClosingProfileSnapshot_salaryClosingId_salaryProfileId_key"
  ON "SalaryClosingProfileSnapshot"("salaryClosingId", "salaryProfileId");
CREATE INDEX "SalaryClosingProfileSnapshot_tenantId_outletId_idx"
  ON "SalaryClosingProfileSnapshot"("tenantId", "outletId");
CREATE INDEX "SalaryAdjustment_tenantId_outletId_salaryClosingEmployeeId_voidedAt_idx"
  ON "SalaryAdjustment"("tenantId", "outletId", "salaryClosingEmployeeId", "voidedAt");

ALTER TABLE "SalaryEmployee" ADD CONSTRAINT "SalaryEmployee_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryEmployee" ADD CONSTRAINT "SalaryEmployee_outletId_fkey"
  FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryProfile" ADD CONSTRAINT "SalaryProfile_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryProfile" ADD CONSTRAINT "SalaryProfile_outletId_fkey"
  FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryProfile" ADD CONSTRAINT "SalaryProfile_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryProfileSetting" ADD CONSTRAINT "SalaryProfileSetting_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryProfileSetting" ADD CONSTRAINT "SalaryProfileSetting_outletId_fkey"
  FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryProfileSetting" ADD CONSTRAINT "SalaryProfileSetting_salaryProfileId_fkey"
  FOREIGN KEY ("salaryProfileId") REFERENCES "SalaryProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeSalaryAssignment" ADD CONSTRAINT "EmployeeSalaryAssignment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeSalaryAssignment" ADD CONSTRAINT "EmployeeSalaryAssignment_outletId_fkey"
  FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeSalaryAssignment" ADD CONSTRAINT "EmployeeSalaryAssignment_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "SalaryEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeSalaryAssignment" ADD CONSTRAINT "EmployeeSalaryAssignment_salaryProfileId_fkey"
  FOREIGN KEY ("salaryProfileId") REFERENCES "SalaryProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeSalaryAssignment" ADD CONSTRAINT "EmployeeSalaryAssignment_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryClosing" ADD CONSTRAINT "SalaryClosing_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryClosing" ADD CONSTRAINT "SalaryClosing_outletId_fkey"
  FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryClosing" ADD CONSTRAINT "SalaryClosing_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryClosing" ADD CONSTRAINT "SalaryClosing_closedByUserId_fkey"
  FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryClosing" ADD CONSTRAINT "SalaryClosing_processedByUserId_fkey"
  FOREIGN KEY ("processedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryClosingSequence" ADD CONSTRAINT "SalaryClosingSequence_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryClosingSequence" ADD CONSTRAINT "SalaryClosingSequence_outletId_fkey"
  FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryClosingEmployee" ADD CONSTRAINT "SalaryClosingEmployee_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryClosingEmployee" ADD CONSTRAINT "SalaryClosingEmployee_outletId_fkey"
  FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryClosingEmployee" ADD CONSTRAINT "SalaryClosingEmployee_salaryClosingId_fkey"
  FOREIGN KEY ("salaryClosingId") REFERENCES "SalaryClosing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryClosingEmployee" ADD CONSTRAINT "SalaryClosingEmployee_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "SalaryEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryClosingEmployee" ADD CONSTRAINT "SalaryClosingEmployee_salaryProfileId_fkey"
  FOREIGN KEY ("salaryProfileId") REFERENCES "SalaryProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryClosingComponent" ADD CONSTRAINT "SalaryClosingComponent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryClosingComponent" ADD CONSTRAINT "SalaryClosingComponent_outletId_fkey"
  FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryClosingComponent" ADD CONSTRAINT "SalaryClosingComponent_salaryClosingEmployeeId_fkey"
  FOREIGN KEY ("salaryClosingEmployeeId") REFERENCES "SalaryClosingEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryClosingProfileSnapshot" ADD CONSTRAINT "SalaryClosingProfileSnapshot_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryClosingProfileSnapshot" ADD CONSTRAINT "SalaryClosingProfileSnapshot_outletId_fkey"
  FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryClosingProfileSnapshot" ADD CONSTRAINT "SalaryClosingProfileSnapshot_salaryClosingId_fkey"
  FOREIGN KEY ("salaryClosingId") REFERENCES "SalaryClosing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryClosingProfileSnapshot" ADD CONSTRAINT "SalaryClosingProfileSnapshot_salaryProfileId_fkey"
  FOREIGN KEY ("salaryProfileId") REFERENCES "SalaryProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryAdjustment" ADD CONSTRAINT "SalaryAdjustment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryAdjustment" ADD CONSTRAINT "SalaryAdjustment_outletId_fkey"
  FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryAdjustment" ADD CONSTRAINT "SalaryAdjustment_salaryClosingEmployeeId_fkey"
  FOREIGN KEY ("salaryClosingEmployeeId") REFERENCES "SalaryClosingEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryAdjustment" ADD CONSTRAINT "SalaryAdjustment_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryAdjustment" ADD CONSTRAINT "SalaryAdjustment_voidedByUserId_fkey"
  FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
