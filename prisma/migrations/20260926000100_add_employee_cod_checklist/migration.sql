-- CreateEnum
CREATE TYPE "EmployeeCodChecklistMethod" AS ENUM ('CASH', 'TRANSFER');

-- CreateTable
CREATE TABLE "EmployeeCodChecklist" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outletId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "waybill" TEXT NOT NULL,
    "operationalDate" DATE NOT NULL,
    "method" "EmployeeCodChecklistMethod",
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EmployeeCodChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeCodChecklist_tenantId_outletId_employeeId_waybill_operationalDate_key"
ON "EmployeeCodChecklist"("tenantId", "outletId", "employeeId", "waybill", "operationalDate");

-- CreateIndex
CREATE INDEX "EmployeeCodChecklist_tenantId_outletId_employeeId_operationalDate_idx"
ON "EmployeeCodChecklist"("tenantId", "outletId", "employeeId", "operationalDate");

-- AddForeignKey
ALTER TABLE "EmployeeCodChecklist" ADD CONSTRAINT "EmployeeCodChecklist_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCodChecklist" ADD CONSTRAINT "EmployeeCodChecklist_outletId_fkey"
FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCodChecklist" ADD CONSTRAINT "EmployeeCodChecklist_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "SalaryEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
