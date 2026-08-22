export type MonitoringDetailSearchRow = {
  waybill: string;
  customer: string | null;
  team: string;
  receiverAddress?: string | null;
};

export function matchesMonitoringDetailSearch(
  row: MonitoringDetailSearchRow,
  rawQuery: string,
) {
  const query = rawQuery.trim().toLocaleUpperCase("id-ID");
  if (!query) return true;
  return [row.waybill, row.customer, row.team, row.receiverAddress].some((value) =>
    value?.toLocaleUpperCase("id-ID").includes(query),
  );
}
