import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../../prisma/migrations/20260730000500_backfill_cash_movement_sources/migration.sql", import.meta.url),
  "utf8",
);

describe("CashMovement historical backfill contract", () => {
  it("covers every valid historical source needed by payment integration", () => {
    expect(migration).toContain('FROM "PickupPayment"');
    expect(migration).toContain('FROM "CourierSettlementPayment"');
    expect(migration).toContain('FROM "OperationalExpense"');
    expect(migration).toContain('FROM "OperationalClosing"');
    expect(migration).toContain(`p."recordStatus" = 'VALID'`);
    expect(migration).toContain(`e."status" = 'VALID'`);
    expect(migration).toContain(`c."status" = 'CLOSED'`);
  });

  it("creates pickup cash/bank, delivery cash/bank, expense, and deposit double entry", () => {
    expect(migration).toContain(`'PICKUP_PAYMENT'::"CashMovementType"`);
    expect(migration).toContain(`'DELIVERY_PAYMENT'::"CashMovementType"`);
    expect(migration).toContain(`'OPERATIONAL_EXPENSE'::"CashMovementType"`);
    expect(migration).toContain(`'BANK_DEPOSIT'::"CashMovementType"`);
    expect(migration).toContain(`'OUT'::"CashDirection"`);
    expect(migration).toContain(`'IN'::"CashDirection"`);
  });

  it("is idempotent and tenant/outlet/source scoped", () => {
    const conflicts = migration.match(/ON CONFLICT \(/g) ?? [];
    expect(conflicts).toHaveLength(6);
    expect(migration).toContain('"tenantId", "outletId", "sourceType", "sourceId", "direction", "channel"');
    expect(migration.match(/DO NOTHING;/g)).toHaveLength(6);
  });

  it("contains no destructive statements", () => {
    expect(migration).not.toMatch(/\b(?:DELETE|TRUNCATE|DROP)\b/i);
  });
});
