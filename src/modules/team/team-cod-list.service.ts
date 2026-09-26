import "server-only";
import type { EmployeeCodChecklistMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TeamContext } from "@/lib/auth/session";
import { getActiveFinancialDispatchDataset, type ActiveFinancialDispatchRecord } from "@/modules/delivery-settlement/active-dispatch-dataset";
import { canonicalDispatchText, canonicalWaybill } from "@/modules/delivery-settlement/dispatch-deduplication";
import { canonicalCourierName } from "./team-courier";

export type CodListPackage = {
  waybill: string;
  recipientName: string | null;
  address: string | null;
  type: "COD" | "DFOD";
  amount: number;
  method: EmployeeCodChecklistMethod | null;
  checked: boolean;
};

export type CodListSummary = {
  total: number;
  cash: number;
  transfer: number;
  unfinished: number;
  packageCount: number;
  completedCount: number;
  unfinishedCount: number;
};

type Money = { toNumber(): number } | number | string;
type CodListDeliveryRow = {
  waybillNo: string; courierNameRaw: string | null;
  receiverName: string | null; receiverAddress: string | null;
  settlementTypeRaw: string | null; freightAmount: Money; codValue: Money;
};
type ChecklistRow = { waybill: string; method: EmployeeCodChecklistMethod | null; checked: boolean };

export type CodListReader = {
  rawDispatch: { findMany(args: Prisma.RawDispatchFindManyArgs): Promise<ActiveFinancialDispatchRecord[]> };
  employeeCodChecklist: {
    findMany(args: Prisma.EmployeeCodChecklistFindManyArgs): Promise<ChecklistRow[]>;
    upsert(args: Prisma.EmployeeCodChecklistUpsertArgs): Promise<ChecklistRow>;
  };
};

export class TeamCodListError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}

export function parseOperationalDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TeamCodListError("INVALID_OPERATIONAL_DATE", 400);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new TeamCodListError("INVALID_OPERATIONAL_DATE", 400);
  }
  return date;
}

export function todayInJakarta(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const number = (value: Money) => typeof value === "object" ? value.toNumber() : Number(value);

export function summarizeCodList(packages: CodListPackage[]): CodListSummary {
  const complete = (item: CodListPackage) => item.checked && item.method !== null;
  const cash = packages.filter((item) => complete(item) && item.method === "CASH").reduce((sum, item) => sum + item.amount, 0);
  const transfer = packages.filter((item) => complete(item) && item.method === "TRANSFER").reduce((sum, item) => sum + item.amount, 0);
  const unfinished = packages.filter((item) => !complete(item)).reduce((sum, item) => sum + item.amount, 0);
  return {
    total: cash + transfer + unfinished,
    cash, transfer, unfinished,
    packageCount: packages.length,
    completedCount: packages.filter(complete).length,
    unfinishedCount: packages.filter((item) => !complete(item)).length,
  };
}

export function mergeCodListSources(input: {
  dispatches: CodListDeliveryRow[];
  checklists: ChecklistRow[];
  acceptedNames: Set<string>;
}) {
  const checklistByWaybill = new Map(input.checklists.map((row) => [canonicalWaybill(row.waybill), row]));
  const packages = new Map<string, CodListPackage>();
  const belongsToEmployee = (name: string | null) => !!name && input.acceptedNames.has(canonicalCourierName(name));

  for (const row of input.dispatches) {
    if (!belongsToEmployee(row.courierNameRaw)) continue;
    const waybill = canonicalWaybill(row.waybillNo);
    if (!waybill) continue;
    const codAmount = number(row.codValue);
    const dfodAmount = canonicalDispatchText(row.settlementTypeRaw) === "DFOD" ? number(row.freightAmount) : 0;
    if (codAmount <= 0 && dfodAmount <= 0) continue;
    const state = checklistByWaybill.get(waybill);
    packages.set(waybill, {
      waybill,
      recipientName: row.receiverName,
      address: row.receiverAddress,
      type: codAmount > 0 ? "COD" : "DFOD",
      amount: codAmount > 0 ? codAmount : dfodAmount,
      method: state?.method ?? null,
      checked: state?.checked === true && state.method !== null,
    });
  }
  return [...packages.values()].sort((left, right) =>
    Number(left.checked) - Number(right.checked) || left.waybill.localeCompare(right.waybill)
  );
}

async function loadRows(input: {
  context: TeamContext; acceptedNames: Set<string>; businessDate: string; client: CodListReader;
}) {
  const operationalDate = parseOperationalDate(input.businessDate);
  const scope = { tenantId: input.context.tenantId, outletId: input.context.outletId, operationalDate };
  const [dispatches, checklists] = await Promise.all([
    getActiveFinancialDispatchDataset({
      tenantId: input.context.tenantId,
      outletId: input.context.outletId,
      operationalDate,
      client: input.client,
    }),
    input.client.employeeCodChecklist.findMany({
      where: { ...scope, employeeId: input.context.salaryEmployeeId },
      select: { waybill: true, method: true, checked: true },
    }),
  ]);
  return mergeCodListSources({ dispatches, checklists, acceptedNames: input.acceptedNames });
}

export async function getTeamCodList(input: {
  context: TeamContext; acceptedNames: Set<string>; businessDate: string; client?: CodListReader;
}) {
  const packages = await loadRows({ ...input, client: input.client ?? (prisma as unknown as CodListReader) });
  return { businessDate: input.businessDate, packages, summary: summarizeCodList(packages) };
}

export async function updateTeamCodChecklist(input: {
  context: TeamContext;
  acceptedNames: Set<string>;
  businessDate: string;
  waybill: string;
  method: EmployeeCodChecklistMethod | null;
  checked: boolean;
  client?: CodListReader;
}) {
  if (input.checked && !input.method) throw new TeamCodListError("CHECKLIST_METHOD_REQUIRED", 400);
  const client = input.client ?? (prisma as unknown as CodListReader);
  const operationalDate = parseOperationalDate(input.businessDate);
  const waybill = canonicalWaybill(input.waybill);
  const packages = await loadRows({ ...input, client });
  if (!packages.some((item) => item.waybill === waybill)) throw new TeamCodListError("COD_PACKAGE_NOT_FOUND", 404);
  await client.employeeCodChecklist.upsert({
    where: { tenantId_outletId_employeeId_waybill_operationalDate: {
      tenantId: input.context.tenantId, outletId: input.context.outletId,
      employeeId: input.context.salaryEmployeeId, waybill, operationalDate,
    } },
    create: {
      tenantId: input.context.tenantId, outletId: input.context.outletId,
      employeeId: input.context.salaryEmployeeId, waybill, operationalDate,
      method: input.method, checked: input.checked,
    },
    update: { method: input.method, checked: input.checked },
    select: { waybill: true, method: true, checked: true },
  });
  return getTeamCodList({ ...input, client });
}
