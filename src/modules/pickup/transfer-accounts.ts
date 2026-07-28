import "server-only";

export type TransferAccountOption = {
  id: string;
  label: string;
};

export function getPickupTransferAccounts(): TransferAccountOption[] {
  const source = process.env.PICKUP_TRANSFER_ACCOUNTS;
  if (!source) return [];
  try {
    const parsed: unknown = JSON.parse(source);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (
        !item ||
        typeof item !== "object" ||
        !("id" in item) ||
        !("label" in item) ||
        typeof item.id !== "string" ||
        typeof item.label !== "string" ||
        !item.id.trim() ||
        !item.label.trim()
      ) return [];
      return [{ id: item.id.trim(), label: item.label.trim() }];
    });
  } catch {
    return [];
  }
}
