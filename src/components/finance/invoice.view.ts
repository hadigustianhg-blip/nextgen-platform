export function moneyToCents(value: string) {
  const normalized = value.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return 0n;
  const negative = normalized.startsWith("-");
  const [whole, fraction = ""] = normalized.replace("-", "").split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -cents : cents;
}

export function sumMoney(values: string[]) {
  return values.reduce((sum, value) => sum + moneyToCents(value), 0n);
}

export function formatRupiahFromCents(cents: bigint) {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const rupiah = absolute / 100n;
  return `${negative ? "-" : ""}Rp${new Intl.NumberFormat("id-ID").format(rupiah)}`;
}

export function normalizeSellerLabel(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}
