import {
  selectLatestDispatchRecords,
} from "@/modules/delivery-settlement/dispatch-deduplication";

export const DELIVERY_TARGET = 95;

export type DeliveryAggregate = {
  operationalDate: Date;
  courierNameRaw: string | null;
  _count: { waybillNo: number };
};

export type DeliverySourceRecord = {
  id: string;
  operationalDate: Date;
  waybillNo: string;
  courierNameRaw: string | null;
  deliveryStatusRaw: string | null;
  syncStatus: string;
  isActive: boolean;
  sourceRecordKey: string;
  sourceFetchedAt: Date;
  dispatchAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const dateKey = (value: Date) => value.toISOString().slice(0, 10);
const nameKey = (value: string | null) =>
  (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
const aggregateKey = (date: Date, name: string | null) =>
  `${dateKey(date)}\u0000${nameKey(name).toLocaleUpperCase("id-ID")}`;
const canonical = (value: string | null | undefined) =>
  (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ")
    .toLocaleUpperCase("id-ID");

export function selectFinalDeliveryRecords(
  records: DeliverySourceRecord[],
  businessDate: string,
) {
  return selectLatestDispatchRecords(records.filter((record) =>
    dateKey(record.operationalDate) === businessDate &&
    record.syncStatus === "NORMALIZED" && record.isActive
  ));
}

export function buildDeliveryMonitoring(
  records: DeliverySourceRecord[],
  businessDate: string,
) {
  const finalRecords = selectFinalDeliveryRecords(records, businessDate);
  const byTeam = new Map<string, {
    teamName: string;
    totalDelivery: number;
    totalTtd: number;
  }>();
  for (const record of finalRecords) {
    const normalizedName = nameKey(record.courierNameRaw);
    const teamKey = canonical(normalizedName);
    const team = byTeam.get(teamKey) ?? {
      teamName: normalizedName || "Team Belum Terpetakan",
      totalDelivery: 0,
      totalTtd: 0,
    };
    team.totalDelivery += 1;
    if (canonical(record.deliveryStatusRaw) === "PENERIMAAN NORMAL") {
      team.totalTtd += 1;
    }
    byTeam.set(teamKey, team);
  }
  const rows = [...byTeam.values()].map((team) => {
    const totalPending = team.totalDelivery - team.totalTtd;
    const achievement = calculateAchievement(
      team.totalTtd,
      team.totalDelivery,
    );
    return {
      businessDate,
      ...team,
      totalPending,
      achievement,
      target: DELIVERY_TARGET,
      status: achievement >= DELIVERY_TARGET
        ? ("ACHIEVE" as const)
        : ("NOT ACHIEVE" as const),
    };
  }).sort((left, right) =>
    right.achievement - left.achievement ||
    right.totalDelivery - left.totalDelivery ||
    left.teamName.localeCompare(right.teamName, "id-ID")
  );
  const totalDelivery = finalRecords.length;
  const totalTtd = rows.reduce((sum, row) => sum + row.totalTtd, 0);
  const totalPending = totalDelivery - totalTtd;
  const teamDelivery = rows.reduce((sum, row) => sum + row.totalDelivery, 0);
  const teamPending = rows.reduce((sum, row) => sum + row.totalPending, 0);
  assertDeliveryInvariant(!(
    totalDelivery !== totalTtd + totalPending ||
    teamDelivery !== totalDelivery ||
    teamPending !== totalPending
  ));
  return {
    finalRecords,
    rows,
    summary: {
      totalDelivery,
      totalTtd,
      totalPending,
      deliveryAchievement: calculateAchievement(totalTtd, totalDelivery),
    },
  };
}

export function calculateAchievement(totalTtd: number, totalDelivery: number) {
  return totalDelivery === 0 ? 0 : (totalTtd / totalDelivery) * 100;
}

export function assertDeliveryInvariant(
  valid: boolean,
  options: {
    environment?: string;
    warn?: (message: string) => void;
  } = {},
) {
  if (valid) return;
  const message = "MONITORING_DAILY_DELIVERY_INVARIANT_FAILED";
  if ((options.environment ?? process.env.NODE_ENV) === "production") {
    (options.warn ?? console.warn)(message);
    return;
  }
  throw new Error(message);
}

export function buildDeliveryRows(
  totals: DeliveryAggregate[],
  received: DeliveryAggregate[],
  pending: DeliveryAggregate[],
) {
  const receivedByGroup = new Map(
    received.map((row) => [
      aggregateKey(row.operationalDate, row.courierNameRaw),
      row._count.waybillNo,
    ]),
  );
  void pending;
  return totals
    .map((row) => {
      const key = aggregateKey(row.operationalDate, row.courierNameRaw);
      const totalDelivery = row._count.waybillNo;
      const totalTtd = receivedByGroup.get(key) ?? 0;
      const achievement = calculateAchievement(totalTtd, totalDelivery);
      return {
        businessDate: dateKey(row.operationalDate),
        teamName: nameKey(row.courierNameRaw) || "Tanpa Team",
        totalDelivery,
        totalTtd,
        totalPending: totalDelivery - totalTtd,
        achievement,
        target: DELIVERY_TARGET,
        status:
          achievement >= DELIVERY_TARGET
            ? ("ACHIEVE" as const)
            : ("NOT ACHIEVE" as const),
      };
    })
    .sort(
      (left, right) =>
        right.achievement - left.achievement ||
        right.totalDelivery - left.totalDelivery,
    );
}

export type SyncSourceResult = {
  success: boolean;
  processed?: number;
  received?: number;
  unique?: number;
  created?: number;
  updated?: number;
  duplicateIgnored?: number;
  error?: string;
  code?: string;
  status?: number | null;
  message?: string;
};

type SyncSourceCounts = Omit<SyncSourceResult, "success" | "error" | "code" | "status" | "message">;

export function extractSyncErrorDetails(type: "DISPATCH" | "PICKUP", err: any) {
  const status =
    err?.diagnostic?.httpStatus ??
    err?.status ??
    err?.httpStatus ??
    err?.response?.status ??
    err?.statusCode ??
    null;

  const rawCode =
    err?.diagnostic?.code ??
    err?.code ??
    err?.errorCode ??
    err?.response?.data?.error ??
    err?.name ??
    "SYNC_ERROR";

  const code = String(rawCode);

  const rawMessage =
    err?.diagnostic?.bodyPreview ??
    err?.message ??
    err?.errorMessage ??
    err?.response?.data?.message ??
    String(err);

  const message = String(rawMessage).replace(
    /("?(?:token|authtoken|authorization|cookie|password|authkey|x-auth-key)"?\s*[:=]\s*)[^,\s<]+/gi,
    "$1[REDACTED]"
  );

  const middlewarePath =
    err?.diagnostic?.endpoint ??
    err?.diagnostic?.target ??
    err?.middlewarePath ??
    err?.endpoint ??
    err?.target ??
    err?.config?.url ??
    err?.response?.config?.url ??
    (type === "DISPATCH" ? "/dispatch" : "/pickup");

  return {
    status,
    code,
    message,
    middlewarePath: String(middlewarePath),
  };
}

export async function orchestrateMonitoringSync(
  syncDispatch: () => Promise<SyncSourceCounts>,
  syncPickup: () => Promise<SyncSourceCounts>,
): Promise<{
  success: boolean;
  dispatch: SyncSourceResult;
  pickup: SyncSourceResult;
}> {
  let dispatch: SyncSourceResult;
  let pickup: SyncSourceResult;
  try {
    dispatch = { success: true, ...(await syncDispatch()) };
  } catch (err: unknown) {
    const errorDetails = extractSyncErrorDetails("DISPATCH", err);
    console.error(`[MONITORING_SYNC][DISPATCH]`, errorDetails);
    dispatch = {
      success: false,
      error: "Sinkronisasi Dispatch gagal.",
      code: errorDetails.code,
      status: errorDetails.status,
      message: errorDetails.message,
    };
  }
  try {
    pickup = { success: true, ...(await syncPickup()) };
  } catch (err: unknown) {
    const errorDetails = extractSyncErrorDetails("PICKUP", err);
    console.error(`[MONITORING_SYNC][PICKUP]`, errorDetails);
    pickup = {
      success: false,
      error: "Sinkronisasi Pickup gagal.",
      code: errorDetails.code,
      status: errorDetails.status,
      message: errorDetails.message,
    };
  }
  return {
    success: dispatch.success && pickup.success,
    dispatch,
    pickup,
  };
}
