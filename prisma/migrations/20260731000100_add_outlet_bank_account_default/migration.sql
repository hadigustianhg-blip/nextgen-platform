ALTER TABLE "OutletBankAccount"
  ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

WITH ranked_accounts AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "tenantId", "outletId"
      ORDER BY "displayOrder" ASC, "createdAt" ASC, "id" ASC
    ) AS account_rank
  FROM "OutletBankAccount"
  WHERE "isActive" = true
)
UPDATE "OutletBankAccount" AS account
SET "isDefault" = true
FROM ranked_accounts
WHERE account."id" = ranked_accounts."id"
  AND ranked_accounts.account_rank = 1;

CREATE UNIQUE INDEX "OutletBankAccount_one_default_per_outlet_idx"
  ON "OutletBankAccount" ("tenantId", "outletId")
  WHERE "isDefault" = true;
