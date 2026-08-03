ALTER TABLE "SalaryPublicationShare"
  ADD COLUMN "publishedAt" TIMESTAMPTZ(3),
  ADD COLUMN "publishedByUserId" UUID;

CREATE INDEX "SalaryPublicationShare_salaryClosingEmployeeId_publishedAt_idx"
  ON "SalaryPublicationShare"("salaryClosingEmployeeId", "publishedAt");

ALTER TABLE "SalaryPublicationShare"
  ADD CONSTRAINT "SalaryPublicationShare_publishedByUserId_fkey"
  FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
