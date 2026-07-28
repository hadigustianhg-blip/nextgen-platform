export const MAX_DELIVERY_TRANSFERS = 8;

export function rupiahDigits(value: string) {
  return value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "") || "0";
}

export function loadExistingTransfers(
  transfers: Array<{ sequence: number; amount: string }>,
) {
  return [...transfers]
    .filter((item) => item.sequence >= 1 && item.sequence <= MAX_DELIVERY_TRANSFERS)
    .sort((a, b) => a.sequence - b.sequence)
    .slice(0, MAX_DELIVERY_TRANSFERS)
    .map((item) => rupiahDigits(item.amount.split(".")[0] ?? "0"));
}

export function addTransferRow(transfers: string[]) {
  return transfers.length >= MAX_DELIVERY_TRANSFERS ? transfers : [...transfers, "0"];
}

export function removeTransferRow(transfers: string[], index: number) {
  return transfers.filter((_, itemIndex) => itemIndex !== index);
}

export function buildTransferPayload(transfers: string[]) {
  return transfers.slice(0, MAX_DELIVERY_TRANSFERS).map((amount, index) => ({
    sequence: index + 1,
    amount: rupiahDigits(amount),
  }));
}

export function calculateTransferDraft(
  settlement: string,
  cash: string,
  transfers: string[],
) {
  const totalSettlement = BigInt(settlement.split(".")[0] || "0");
  const cashAmount = BigInt(rupiahDigits(cash));
  const transferAmount = transfers.reduce(
    (sum, item) => sum + BigInt(rupiahDigits(item)),
    0n,
  );
  const totalReceived = cashAmount + transferAmount;
  const remainingAmount = totalSettlement - totalReceived;
  return {
    totalSettlement,
    cashAmount,
    transferAmount,
    totalReceived,
    remainingAmount,
    outstandingAmount: remainingAmount > 0n ? remainingAmount : 0n,
    overpaidAmount: remainingAmount < 0n ? -remainingAmount : 0n,
    status:
      remainingAmount > 0n
        ? "UNCLEARED"
        : remainingAmount === 0n
          ? "CLEAR"
          : "OVERPAID",
  } as const;
}
