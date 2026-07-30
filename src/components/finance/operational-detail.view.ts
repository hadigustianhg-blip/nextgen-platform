export type OperationalDetailRow = {
  id: string;
  date: string;
  category: string;
  description: string | null;
  amount: number;
  pic: string;
  referenceNumber: string;
  recipientName: string | null;
};

export type CashAdvanceGroup = {
  key: string;
  name: string;
  totalAmount: number;
  transactionCount: number;
  transactions: OperationalDetailRow[];
};

export function isCashAdvanceCategory(category: string | null) {
  return category?.normalize("NFKC").trim().toLocaleLowerCase("id-ID") === "kasbon";
}

export function sortOperationalDetails(rows: OperationalDetailRow[]) {
  return [...rows].sort((left, right) =>
    right.date.localeCompare(left.date) || right.id.localeCompare(left.id));
}

export function groupCashAdvanceDetails(rows: OperationalDetailRow[]) {
  const groups = new Map<string, CashAdvanceGroup>();
  for (const transaction of sortOperationalDetails(rows)) {
    const normalizedName = (transaction.recipientName ?? "")
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ");
    const key = normalizedName
      ? normalizedName.toLocaleLowerCase("id-ID")
      : "__without_name__";
    const existing = groups.get(key);
    if (existing) {
      if (displayNameScore(normalizedName) > displayNameScore(existing.name)) {
        existing.name = normalizedName;
      }
      existing.totalAmount += transaction.amount;
      existing.transactionCount += 1;
      existing.transactions.push(transaction);
    } else {
      groups.set(key, {
        key,
        name: normalizedName || "Tanpa Nama",
        totalAmount: transaction.amount,
        transactionCount: 1,
        transactions: [transaction],
      });
    }
  }
  return [...groups.values()].sort((left, right) =>
    right.totalAmount - left.totalAmount ||
    left.name.localeCompare(right.name, "id-ID"));
}

function displayNameScore(value: string) {
  if (!value || value === "Tanpa Nama") return 0;
  const hasUpper = value !== value.toLocaleLowerCase("id-ID");
  const hasLower = value !== value.toLocaleUpperCase("id-ID");
  return hasUpper && hasLower ? 2 : 1;
}
