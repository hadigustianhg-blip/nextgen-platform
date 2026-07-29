-- Historical PickupPayment -> CashMovement.
-- Idempotent through the source identity unique key and ON CONFLICT.
INSERT INTO "CashMovement" (
  "id", "tenantId", "outletId", "businessDate", "occurredAt",
  "direction", "channel", "movementType", "amount", "description",
  "reference", "sourceType", "sourceId", "requestKey", "recordStatus",
  "createdByUserId", "createdAt", "updatedAt"
)
SELECT
  md5(p."id"::text || ':pickup-payment')::uuid,
  p."tenantId",
  p."outletId",
  p."paymentDate",
  p."createdAt",
  'IN'::"CashDirection",
  CASE
    WHEN upper(trim(p."paymentMethodRaw")) IN ('CASH', 'TUNAI')
      THEN 'CASH'::"CashChannel"
    ELSE 'BANK'::"CashChannel"
  END,
  'PICKUP_PAYMENT'::"CashMovementType",
  p."receivedAmount",
  'Pembayaran pickup',
  mp."waybillNo",
  'PickupPayment',
  p."id"::text,
  p."id",
  'VALID'::"CashMovementStatus",
  p."createdByUserId",
  p."createdAt",
  p."updatedAt"
FROM "PickupPayment" p
JOIN "MasterPickup" mp ON mp."id" = p."masterPickupId"
WHERE p."recordStatus" = 'VALID'
  AND p."receivedAmount" > 0
ON CONFLICT (
  "tenantId", "outletId", "sourceType", "sourceId", "direction", "channel"
) DO NOTHING;

-- Historical delivery cash receipt.
INSERT INTO "CashMovement" (
  "id", "tenantId", "outletId", "businessDate", "occurredAt",
  "direction", "channel", "movementType", "amount", "description",
  "reference", "sourceType", "sourceId", "requestKey", "recordStatus",
  "createdByUserId", "createdAt", "updatedAt"
)
SELECT
  md5(p."id"::text || ':delivery-cash')::uuid,
  p."tenantId",
  p."outletId",
  p."paymentDate",
  p."createdAt",
  'IN'::"CashDirection",
  'CASH'::"CashChannel",
  'DELIVERY_PAYMENT'::"CashMovementType",
  p."cashAmount",
  'Pembayaran delivery tunai',
  ms."courierName",
  'CourierSettlementPayment',
  p."id"::text,
  p."id",
  'VALID'::"CashMovementStatus",
  p."createdByUserId",
  p."createdAt",
  p."updatedAt"
FROM "CourierSettlementPayment" p
JOIN "MasterSetoran" ms ON ms."id" = p."masterSetoranId"
WHERE p."recordStatus" = 'VALID'
  AND p."cashAmount" > 0
ON CONFLICT (
  "tenantId", "outletId", "sourceType", "sourceId", "direction", "channel"
) DO NOTHING;

-- Historical delivery transfer receipt.
INSERT INTO "CashMovement" (
  "id", "tenantId", "outletId", "businessDate", "occurredAt",
  "direction", "channel", "movementType", "amount", "description",
  "reference", "sourceType", "sourceId", "requestKey", "recordStatus",
  "createdByUserId", "createdAt", "updatedAt"
)
SELECT
  md5(p."id"::text || ':delivery-bank')::uuid,
  p."tenantId",
  p."outletId",
  p."paymentDate",
  p."createdAt",
  'IN'::"CashDirection",
  'BANK'::"CashChannel",
  'DELIVERY_PAYMENT'::"CashMovementType",
  p."transferAmountSnapshot",
  'Pembayaran delivery transfer',
  ms."courierName",
  'CourierSettlementPayment',
  p."id"::text,
  p."id",
  'VALID'::"CashMovementStatus",
  p."createdByUserId",
  p."createdAt",
  p."updatedAt"
FROM "CourierSettlementPayment" p
JOIN "MasterSetoran" ms ON ms."id" = p."masterSetoranId"
WHERE p."recordStatus" = 'VALID'
  AND p."transferAmountSnapshot" > 0
ON CONFLICT (
  "tenantId", "outletId", "sourceType", "sourceId", "direction", "channel"
) DO NOTHING;

-- Historical operational expenses.
INSERT INTO "CashMovement" (
  "id", "tenantId", "outletId", "businessDate", "occurredAt",
  "direction", "channel", "movementType", "amount", "description",
  "reference", "sourceType", "sourceId", "requestKey", "recordStatus",
  "createdByUserId", "createdAt", "updatedAt"
)
SELECT
  md5(e."id"::text || ':operational-expense')::uuid,
  e."tenantId",
  e."outletId",
  e."operationalDate",
  e."createdAt",
  'OUT'::"CashDirection",
  'CASH'::"CashChannel",
  'OPERATIONAL_EXPENSE'::"CashMovementType",
  e."amount",
  COALESCE(e."description", e."category"),
  COALESCE(e."vehiclePlate", e."teamName"),
  'OperationalExpense',
  e."id"::text,
  e."id",
  'VALID'::"CashMovementStatus",
  e."createdByUserId",
  e."createdAt",
  e."updatedAt"
FROM "OperationalExpense" e
WHERE e."status" = 'VALID'
  AND e."amount" > 0
ON CONFLICT (
  "tenantId", "outletId", "sourceType", "sourceId", "direction", "channel"
) DO NOTHING;

-- Historical closed bank deposits: double-entry CASH OUT and BANK IN.
INSERT INTO "CashMovement" (
  "id", "tenantId", "outletId", "businessDate", "occurredAt",
  "direction", "channel", "movementType", "amount", "description",
  "reference", "sourceType", "sourceId", "requestKey", "recordStatus",
  "createdByUserId", "createdAt", "updatedAt"
)
SELECT
  md5(c."id"::text || ':bank-deposit-cash')::uuid,
  c."tenantId",
  c."outletId",
  c."operationalDate",
  COALESCE(c."closedAt", c."updatedAt"),
  'OUT'::"CashDirection",
  'CASH'::"CashChannel",
  'BANK_DEPOSIT'::"CashMovementType",
  c."bankDepositAmount",
  'Setoran bank dari kas',
  c."bankDepositReference",
  'OperationalClosing',
  c."id"::text,
  c."id",
  'VALID'::"CashMovementStatus",
  c."closedByUserId",
  c."createdAt",
  c."updatedAt"
FROM "OperationalClosing" c
WHERE c."status" = 'CLOSED'
  AND c."closedByUserId" IS NOT NULL
  AND c."bankDepositAmount" > 0
ON CONFLICT (
  "tenantId", "outletId", "sourceType", "sourceId", "direction", "channel"
) DO NOTHING;

INSERT INTO "CashMovement" (
  "id", "tenantId", "outletId", "businessDate", "occurredAt",
  "direction", "channel", "movementType", "amount", "description",
  "reference", "sourceType", "sourceId", "requestKey", "recordStatus",
  "createdByUserId", "createdAt", "updatedAt"
)
SELECT
  md5(c."id"::text || ':bank-deposit-bank')::uuid,
  c."tenantId",
  c."outletId",
  c."operationalDate",
  COALESCE(c."closedAt", c."updatedAt"),
  'IN'::"CashDirection",
  'BANK'::"CashChannel",
  'BANK_DEPOSIT'::"CashMovementType",
  c."bankDepositAmount",
  'Setoran bank masuk',
  c."bankDepositReference",
  'OperationalClosing',
  c."id"::text,
  c."id",
  'VALID'::"CashMovementStatus",
  c."closedByUserId",
  c."createdAt",
  c."updatedAt"
FROM "OperationalClosing" c
WHERE c."status" = 'CLOSED'
  AND c."closedByUserId" IS NOT NULL
  AND c."bankDepositAmount" > 0
ON CONFLICT (
  "tenantId", "outletId", "sourceType", "sourceId", "direction", "channel"
) DO NOTHING;
