import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { executeTrustedMultiOutletScraper } from "@/modules/integrations/jfs-multi-outlet-client";
import type { SettingsScope } from "@/modules/settings/settings.types";
import {
  type AgingSignRecord,
  normalizeAgingSign,
} from "./sla-cut-off.calculation";

export function resolveSlaSourceEndpoint() {
  const baseUrl = process.env.JFS_MIDDLEWARE_BASE_URL?.trim()
    || process.env.JFS_MIDDLEWARE_URL?.trim();
  if (!baseUrl) {
    throw new SlaSyncError(
      "JFS middleware URL belum dikonfigurasi. Isi JFS_MIDDLEWARE_BASE_URL.",
      "SOURCE_UNAVAILABLE",
      false,
    );
  }
  try {
    return new URL("/jfs-aging-sign", baseUrl);
  } catch {
    throw new SlaSyncError(
      "JFS middleware URL tidak valid. Periksa JFS_MIDDLEWARE_BASE_URL.",
      "SOURCE_UNAVAILABLE",
      false,
    );
  }
}

export type SlaSyncActor =
  | { actorType: "USER"; actorId: string }
  | { actorType: "SYSTEM"; actorId?: never };

export type SlaSyncResult = {
  result: "CREATED" | "UPDATED" | "SKIPPED";
  businessDate?: string;
  sourceRecordKey?: string;
  reason?: "NETWORK_MISMATCH" | "OUTSIDE_PERIOD" | "STALE_SNAPSHOT";
  attempts: number;
};

export class SlaSyncError extends Error {
  constructor(
    message: string,
    public readonly code: "SOURCE_UNAVAILABLE" | "INVALID_RESPONSE",
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}

export type SlaSyncStore = {
  outlet: {
    findFirst(args: object): Promise<{ code: string } | null>;
  };
  rawSlaCutOff: {
    findUnique(args: object): Promise<{ id: string } | null>;
    upsert(args: object): Promise<unknown>;
  };
  auditLog: {
    create(args: object): Promise<unknown>;
  };
};

type Fetcher = typeof fetch;
const jakartaDate = (now: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
const validIsoDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(new Date(`${value}T00:00:00.000Z`).valueOf());
const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function fetchAgingSignSnapshot(
  fetcher: Fetcher = fetch,
  _wait: (milliseconds: number) => Promise<unknown> = sleep,
  _maxAttempts = 3,
  scope?: SettingsScope,
  executeScoped = executeTrustedMultiOutletScraper,
) {
  if (!scope) {
    throw new SlaSyncError("Scope tenant/outlet JFS wajib tersedia.", "SOURCE_UNAVAILABLE", false);
  }
  const payload = await executeScoped(scope, "AGING_SIGN", { fetcher });
  if (!payload || !Array.isArray(payload.data) || payload.data.length !== 1) {
    throw new SlaSyncError("Respons jfs-aging-sign tidak valid.", "INVALID_RESPONSE", false);
  }
  return { record: normalizeAgingSign(payload.data[0]), attempts: 1 };
}

async function writeSyncAudit(
  store: SlaSyncStore,
  input: {
    tenantId: string;
    outletId: string;
    actor: SlaSyncActor;
    startedAt: Date;
    completedAt: Date;
    result: SlaSyncResult["result"] | "FAILED";
    businessDate?: string;
    sourceRecordKey?: string;
    reason?: string;
  },
) {
  await store.auditLog.create({
    data: {
      tenantId: input.tenantId,
      outletId: input.outletId,
      actorId: input.actor.actorType === "USER" ? input.actor.actorId : null,
      action: input.result === "FAILED" ? "UPDATE" : "CREATE",
      entityType: "SLA_CUT_OFF_SYNC",
      entityId: input.sourceRecordKey,
      metadata: {
        module: "SLA_CUT_OFF",
        trigger: input.actor.actorType === "SYSTEM" ? "CRON" : "MANUAL",
        actorType: input.actor.actorType,
        startedAt: input.startedAt.toISOString(),
        completedAt: input.completedAt.toISOString(),
        businessDate: input.businessDate,
        sourceRecordKey: input.sourceRecordKey,
        result: input.result,
        error: input.reason,
      },
    },
  });
}

export async function runSlaSyncForOutlet(
  input: {
    tenantId: string;
    outletId: string;
    expectedNetworkName: string;
    actor: SlaSyncActor;
    periodStart?: string;
    periodEnd?: string;
    requireCurrentJakartaDate?: boolean;
  },
  dependencies: {
    store: SlaSyncStore;
    fetchSnapshot: () => Promise<{ record: AgingSignRecord; attempts: number }>;
    now: () => Date;
  },
): Promise<SlaSyncResult> {
  const startedAt = dependencies.now();
  let auditContext: Partial<SlaSyncResult> = {};
  try {
    const outlet = await dependencies.store.outlet.findFirst({
      where: {
        id: input.outletId,
        tenantId: input.tenantId,
        code: input.expectedNetworkName,
        isActive: true,
      },
      select: { code: true },
    });
    if (!outlet) throw new SlaSyncError("Outlet tidak valid.", "INVALID_RESPONSE", false);
    const { record, attempts } = await dependencies.fetchSnapshot();
    if (!validIsoDate(record.queryTime)) {
      throw new SlaSyncError("queryTime sumber tidak valid.", "INVALID_RESPONSE", false);
    }
    const sourceRecordKey = `${record.networkName}:${record.queryTime}`;
    auditContext = { businessDate: record.queryTime, sourceRecordKey };
    let reason: SlaSyncResult["reason"];
    if (record.networkName !== input.expectedNetworkName) reason = "NETWORK_MISMATCH";
    else if (
      input.requireCurrentJakartaDate &&
      record.queryTime !== jakartaDate(dependencies.now())
    ) reason = "STALE_SNAPSHOT";
    else if (
      (input.periodStart && record.queryTime < input.periodStart) ||
      (input.periodEnd && record.queryTime > input.periodEnd)
    ) reason = "OUTSIDE_PERIOD";
    if (reason) {
      const skipped = { result: "SKIPPED" as const, reason, businessDate: record.queryTime, sourceRecordKey, attempts };
      await writeSyncAudit(dependencies.store, { ...input, actor: input.actor, startedAt, completedAt: dependencies.now(), ...skipped });
      return skipped;
    }
    if (record.queryTime > jakartaDate(dependencies.now())) {
      throw new SlaSyncError("queryTime sumber berada di masa depan.", "INVALID_RESPONSE", false);
    }
    const businessDate = new Date(`${record.queryTime}T00:00:00.000Z`);
    const unique = {
      tenantId: input.tenantId,
      outletId: input.outletId,
      businessDate,
      sourceRecordKey,
    };
    const existing = await dependencies.store.rawSlaCutOff.findUnique({
      where: { tenantId_outletId_businessDate_sourceRecordKey: unique },
      select: { id: true },
    });
    const data = {
      sourceEndpoint: resolveSlaSourceEndpoint().href,
      sourceFetchedAt: dependencies.now(),
      sourcePayload: record as unknown as Prisma.InputJsonValue,
      syncStatus: "NORMALIZED" as const,
      sla: Number(record.signTimelyRate.replace("%", "")),
      paketSampai: record.sendCenterTotal,
      sudahTandaTerima: record.signTimelyTotal,
      belumTandaTerima: record.signDelayNoSignTotal,
      lewatSla: record.signDelayOtherTotal,
    };
    await dependencies.store.rawSlaCutOff.upsert({
      where: { tenantId_outletId_businessDate_sourceRecordKey: unique },
      create: { ...data, ...unique },
      update: data,
    });
    const result = {
      result: existing ? "UPDATED" as const : "CREATED" as const,
      businessDate: record.queryTime,
      sourceRecordKey,
      attempts,
    };
    await writeSyncAudit(dependencies.store, { ...input, actor: input.actor, startedAt, completedAt: dependencies.now(), ...result });
    return result;
  } catch (error) {
    await writeSyncAudit(dependencies.store, {
      tenantId: input.tenantId,
      outletId: input.outletId,
      actor: input.actor,
      startedAt,
      completedAt: dependencies.now(),
      result: "FAILED",
      businessDate: auditContext.businessDate,
      sourceRecordKey: auditContext.sourceRecordKey,
      reason: error instanceof Error ? error.message : "Sinkronisasi gagal.",
    });
    throw error;
  }
}

export function syncSlaCutOffForOutlet(input: {
  tenantId: string;
  outletId: string;
  expectedNetworkName: string;
  actor: SlaSyncActor;
  periodStart?: string;
  periodEnd?: string;
  requireCurrentJakartaDate?: boolean;
}) {
  return runSlaSyncForOutlet(input, {
    store: prisma,
    fetchSnapshot: () => fetchAgingSignSnapshot(fetch, sleep, 3, {
      tenantId: input.tenantId,
      outletId: input.outletId,
    }),
    now: () => new Date(),
  });
}
