export const canonicalCodWaybill = (value: string | null | undefined) =>
  (value ?? "").normalize("NFKC").trim().toLocaleUpperCase("id-ID");

export const codSourceKey = (waybill: string) =>
  `v2:cod:${waybill.trim()}`;

export type CodSettlementCategory = "COD_CASH" | "COD_QRIS" | "EXCLUDED";

export function classifyCodSettlement(record: {
  repaymentTypeCode: number | null;
  repaymentTypeLabel: string | null;
}): CodSettlementCategory {
  const label = (record.repaymentTypeLabel ?? "")
    .normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleUpperCase("id-ID");
  if (record.repaymentTypeCode === 2 || label === "QRIS COD") return "COD_QRIS";
  if (record.repaymentTypeCode === 1 || record.repaymentTypeCode === 3 ||
    (record.repaymentTypeCode === null && ["COD", "COD TUNAI", "TUNAI"].includes(label))) {
    return "COD_CASH";
  }
  return "EXCLUDED";
}

export function deduplicateCodEnvelope<T extends {
  waybillNo: string;
  signTime: string;
}>(records: T[]) {
  const byWaybill = new Map<string, { record: T; index: number }>();
  records.forEach((record, index) => {
    const key = canonicalCodWaybill(record.waybillNo);
    const existing = byWaybill.get(key);
    if (!existing || record.signTime > existing.record.signTime ||
      (record.signTime === existing.record.signTime && index > existing.index)) {
      byWaybill.set(key, { record, index });
    }
  });
  return [...byWaybill.values()]
    .sort((left, right) => left.index - right.index)
    .map(({ record }) => record);
}

export type VersionedCodRecord = {
  id: string;
  waybillNo: string;
  sourceFetchedAt: Date;
  signedAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
};

const newestFirst = <T extends VersionedCodRecord>(left: T, right: T) =>
  right.sourceFetchedAt.getTime() - left.sourceFetchedAt.getTime() ||
  (right.signedAt?.getTime() ?? 0) - (left.signedAt?.getTime() ?? 0) ||
  right.updatedAt.getTime() - left.updatedAt.getTime() ||
  right.createdAt.getTime() - left.createdAt.getTime() ||
  right.id.localeCompare(left.id);

export function selectLatestCodRecords<T extends VersionedCodRecord>(records: T[]) {
  const versions = new Map<string, T[]>();
  for (const record of records) {
    const key = canonicalCodWaybill(record.waybillNo);
    if (!key) continue;
    versions.set(key, [...(versions.get(key) ?? []), record]);
  }
  return [...versions.values()].map((rows) => [...rows].sort(newestFirst)[0]);
}
