import "server-only";
import { prisma } from "@/lib/db/prisma";
import { selectLatestDispatchRecords } from "@/modules/delivery-settlement/dispatch-deduplication";
import { isBelumDiterima } from "./problem-waybill-delivery.service";

const DEFAULT_BASE_URL = "https://jfs-middleware-v2-production.up.railway.app";

export class SensitiveDetailError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "STATUS_CHANGED" | "UNAVAILABLE" | "INVALID_RESPONSE",
    public readonly retryable = false,
  ) {
    super("Detail waybill tidak dapat diambil.");
  }
}

type SensitivePayload = {
  waybillNo?: unknown;
  dispatchTime?: unknown;
  receiverName?: unknown;
  receiverMobilePhone?: unknown;
  receiverTelphone?: unknown;
  receiverDetailedAddress?: unknown;
  abnormalName?: unknown;
  updateTime?: unknown;
};

const nullableText = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export function normalizeSensitiveDetail(
  raw: unknown,
  fallback: { waybill: string; currentStatus: string },
) {
  if (!raw || typeof raw !== "object") throw new SensitiveDetailError("INVALID_RESPONSE");
  const value = raw as SensitivePayload;
  return {
    waybill: nullableText(value.waybillNo) ?? fallback.waybill,
    receiverName: nullableText(value.receiverName),
    receiverPhone:
      nullableText(value.receiverMobilePhone) ?? nullableText(value.receiverTelphone),
    receiverAddress: nullableText(value.receiverDetailedAddress),
    senderName: null,
    senderPhone: null,
    lastScanSite: null,
    lastScanTime: nullableText(value.updateTime) ?? nullableText(value.dispatchTime),
    currentStatus: fallback.currentStatus,
    problemReason: nullableText(value.abnormalName),
  };
}

export async function fetchSensitiveDetail(
  waybill: string,
  options: {
    fetcher?: typeof fetch;
    wait?: (milliseconds: number) => Promise<unknown>;
    baseUrl?: string;
  } = {},
) {
  const url = new URL("/jfs-sensitive", options.baseUrl ?? process.env.JFS_MIDDLEWARE_URL ?? DEFAULT_BASE_URL);
  url.searchParams.set("waybillNo", waybill);
  const wait = options.wait ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await (options.fetcher ?? fetch)(url, {
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) {
        throw new SensitiveDetailError("UNAVAILABLE", response.status >= 500);
      }
      let envelope: unknown;
      try {
        envelope = await response.json();
      } catch {
        throw new SensitiveDetailError("INVALID_RESPONSE");
      }
      if (
        !envelope ||
        typeof envelope !== "object" ||
        (envelope as { success?: unknown }).success !== true ||
        !(envelope as { data?: unknown }).data
      ) {
        throw new SensitiveDetailError("INVALID_RESPONSE");
      }
      return (envelope as { data: unknown }).data;
    } catch (error) {
      const normalized =
        error instanceof SensitiveDetailError
          ? error
          : new SensitiveDetailError("UNAVAILABLE", true);
      if (!normalized.retryable || attempt === 2) throw normalized;
      await wait(250);
    }
  }
  throw new SensitiveDetailError("UNAVAILABLE");
}

export async function getProblemWaybillSensitiveDetail(input: {
  tenantId: string;
  outletId: string;
  actorId: string;
  waybill: string;
  fetcher?: typeof fetch;
}) {
  const audit = (result: "SUCCESS" | "FAILED") =>
    prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        outletId: input.outletId,
        actorId: input.actorId,
        action: "CREATE",
        entityType: "PROBLEM_WAYBILL_SENSITIVE_VIEW",
        entityId: input.waybill,
        metadata: { result },
      },
    });
  const rows = await prisma.rawDispatch.findMany({
    where: {
      tenantId: input.tenantId,
      outletId: input.outletId,
      waybillNo: input.waybill,
      syncStatus: "NORMALIZED",
      isActive: true,
    },
    select: {
      id: true,
      waybillNo: true,
      deliveryStatusRaw: true,
      sourceFetchedAt: true,
      dispatchAt: true,
      updatedAt: true,
      createdAt: true,
    },
  });
  const row = selectLatestDispatchRecords(rows)[0];
  if (!row) {
    await audit("FAILED");
    throw new SensitiveDetailError("NOT_FOUND");
  }
  if (!isBelumDiterima(row.deliveryStatusRaw)) {
    await audit("FAILED");
    throw new SensitiveDetailError("STATUS_CHANGED");
  }
  try {
    const raw = await fetchSensitiveDetail(row.waybillNo, { fetcher: input.fetcher });
    const detail = normalizeSensitiveDetail(raw, {
      waybill: row.waybillNo,
      currentStatus: "Belum diterima",
    });
    await audit("SUCCESS");
    return detail;
  } catch (error) {
    await audit("FAILED");
    throw error;
  }
}
