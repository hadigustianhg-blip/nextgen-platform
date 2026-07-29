CREATE INDEX "CashMovement_settlement_summary_idx"
  ON "CashMovement"(
    "tenantId",
    "outletId",
    "businessDate",
    "recordStatus",
    "channel",
    "direction",
    "movementType"
  );
