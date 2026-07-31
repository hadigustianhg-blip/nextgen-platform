export type VersionedDispatchRecord = {
  id: string;
  waybillNo: string;
  sourceFetchedAt: Date;
  dispatchAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
};

export const canonicalWaybill = (value: string | null | undefined) =>
  (value ?? "").normalize("NFKC").trim().toLocaleUpperCase("id-ID");

const newestFirst = <T extends VersionedDispatchRecord>(left: T, right: T) =>
  right.sourceFetchedAt.getTime() - left.sourceFetchedAt.getTime() ||
  (right.dispatchAt?.getTime() ?? 0) - (left.dispatchAt?.getTime() ?? 0) ||
  right.updatedAt.getTime() - left.updatedAt.getTime() ||
  right.createdAt.getTime() - left.createdAt.getTime() ||
  right.id.localeCompare(left.id);

export function selectLatestDispatchRecords<T extends VersionedDispatchRecord>(
  records: T[],
) {
  const versionsByWaybill = new Map<string, T[]>();
  for (const record of records) {
    const key = canonicalWaybill(record.waybillNo);
    if (!key) continue;
    versionsByWaybill.set(key, [
      ...(versionsByWaybill.get(key) ?? []),
      record,
    ]);
  }
  return [...versionsByWaybill.values()].map((versions) =>
    [...versions].sort(newestFirst)[0]
  );
}
