import { Prisma } from "@prisma/client";

/**
 * Normalizes non-negative source money into whole rupiah.
 * Nullish values follow the RAW ingestion convention and become zero.
 */
export function normalizeMoney(
  value: string | number | Prisma.Decimal | null | undefined,
) {
  try {
    const decimal = new Prisma.Decimal(String(value ?? 0));
    if (!decimal.isFinite() || decimal.isNegative()) {
      throw new Error("Nominal source tidak valid.");
    }
    return decimal.trunc().toNumber();
  } catch {
    throw new Error("Nominal source tidak valid.");
  }
}
