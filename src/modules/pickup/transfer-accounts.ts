import "server-only";

export type TransferAccountOption = {
  id: string;
  label: string;
};

export const PICKUP_TRANSFER_ACCOUNTS = [
  { id: "BCA", label: "BCA" },
  { id: "BRI", label: "BRI" },
  { id: "QRIS", label: "QRIS" },
] as const satisfies readonly TransferAccountOption[];

export function getPickupTransferAccounts(): TransferAccountOption[] {
  return PICKUP_TRANSFER_ACCOUNTS.map((account) => ({ ...account }));
}
