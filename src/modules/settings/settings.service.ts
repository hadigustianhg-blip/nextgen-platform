import argon2 from "argon2";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { buildOutletWhere, buildTenantOutletWhere, type IntegrationActivityView, type IntegrationControlCenter, type IntegrationDatasetStatus, type IntegrationDatasetView, type SettingsActor, type SettingsScope } from "./settings.types";
import { getJfsIntegrationStatus } from "@/modules/integrations/jfs-credential.service";
import type { z } from "zod";
import type { auditLogQuerySchema, bankAccountSchema, businessProfileSchema, financialCategorySchema, userCreateSchema, userUpdateSchema } from "./settings.validation";

type BusinessInput = z.infer<typeof businessProfileSchema>;
type UserCreateInput = z.infer<typeof userCreateSchema>;
type UserInput = z.infer<typeof userUpdateSchema>;
type BankInput = z.infer<typeof bankAccountSchema>;
type CategoryInput = z.infer<typeof financialCategorySchema>;
type AuditQuery = z.infer<typeof auditLogQuerySchema>;

export class SettingsError extends Error { constructor(public code: string, public status = 400) { super(code); } }
const cleanNullable = (value?: string | null) => value?.trim() || null;
export const normalizeFinancialCategory = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ");
export const canonicalizeFinancialCategory = (value: string) => normalizeFinancialCategory(value).toLocaleUpperCase("id-ID");

const audit = (tx: Prisma.TransactionClient, actor: SettingsActor, action: "CREATE" | "UPDATE", entityType: string, entityId: string, fields: string[]) => tx.auditLog.create({ data: { tenantId: actor.tenantId, outletId: actor.outletId, actorId: actor.userId, action, entityType, entityId, metadata: { changedFields: fields } } });

export async function getBusinessProfile(scope: SettingsScope) {
  const [tenant, outlet] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: scope.tenantId }, select: { id: true, name: true, address: true, phone: true, email: true, timezone: true } }),
    prisma.outlet.findFirst({ where: buildOutletWhere(scope), select: { id: true, name: true, code: true, address: true, phone: true, email: true, adminWhatsapp: true, isActive: true } }),
  ]);
  if (!tenant || !outlet) throw new SettingsError("SETTINGS_SCOPE_NOT_FOUND", 404);
  return { tenant, outlet };
}

export async function updateBusinessProfile(actor: SettingsActor, input: BusinessInput) {
  return prisma.$transaction(async (tx) => {
    const outlet = await tx.outlet.findFirst({ where: { id: actor.outletId, tenantId: actor.tenantId }, select: { id: true } });
    if (!outlet) throw new SettingsError("SETTINGS_SCOPE_NOT_FOUND", 404);
    const tenant = await tx.tenant.update({ where: { id: actor.tenantId }, data: { name: input.tenant.name, address: cleanNullable(input.tenant.address), phone: cleanNullable(input.tenant.phone), email: cleanNullable(input.tenant.email), timezone: input.tenant.timezone }, select: { id: true, name: true, address: true, phone: true, email: true, timezone: true } });
    const updatedOutlet = await tx.outlet.update({ where: { id: actor.outletId }, data: { name: input.outlet.name, code: input.outlet.code, address: cleanNullable(input.outlet.address), phone: cleanNullable(input.outlet.phone), email: cleanNullable(input.outlet.email), adminWhatsapp: cleanNullable(input.outlet.adminWhatsapp), isActive: input.outlet.isActive }, select: { id: true, name: true, code: true, address: true, phone: true, email: true, adminWhatsapp: true, isActive: true } });
    await audit(tx, actor, "UPDATE", "SETTINGS_BUSINESS_PROFILE", actor.outletId, ["tenant.name", "tenant.address", "tenant.phone", "tenant.email", "tenant.timezone", "outlet.name", "outlet.code", "outlet.address", "outlet.phone", "outlet.email", "outlet.adminWhatsapp", "outlet.isActive"]);
    return { tenant, outlet: updatedOutlet };
  });
}

export const ADMIN_WEB_ROLE_CODES = ["OWNER", "ADMIN", "FINANCE", "HR", "QC", "OPERATIONAL", "VIEWER"] as const;
const settingsUserSelect = {
  id: true,
  name: true,
  email: true,
  status: true,
  lastLoginAt: true,
  outlet: { select: { id: true, code: true, name: true } },
  roles: { select: { role: { select: { code: true, name: true } } } },
  teamMemberships: {
    where: { status: "ACTIVE" as const },
    select: { id: true, salaryEmployeeId: true, effectiveFrom: true, salaryEmployee: { select: { id: true, name: true, division: true, whatsapp: true, status: true } } },
  },
} satisfies Prisma.UserSelect;

export const listSettingsUsers = (scope: SettingsScope) => prisma.user.findMany({
  where: { tenantId: scope.tenantId, outletId: scope.outletId },
  orderBy: { name: "asc" },
  select: settingsUserSelect,
});

export const listAvailableSalaryEmployees = (scope: SettingsScope) => prisma.salaryEmployee.findMany({
  where: {
    tenantId: scope.tenantId,
    outletId: scope.outletId,
    status: "ACTIVE",
    teamMemberships: { none: { status: "ACTIVE" } },
  },
  orderBy: { name: "asc" },
  select: { id: true, name: true, division: true, whatsapp: true, status: true },
});

function requestedRoleCode(input: Pick<UserInput, "userType" | "roleCode">) {
  if (input.userType === "TEAM_PWA") return "TEAM";
  if (!input.roleCode || !ADMIN_WEB_ROLE_CODES.includes(input.roleCode as typeof ADMIN_WEB_ROLE_CODES[number])) throw new SettingsError("ROLE_NOT_ALLOWED", 400);
  return input.roleCode;
}

async function scopedActiveEmployee(tx: Prisma.TransactionClient, actor: SettingsActor, salaryEmployeeId: string) {
  const employee = await tx.salaryEmployee.findFirst({
    where: { id: salaryEmployeeId, tenantId: actor.tenantId, outletId: actor.outletId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!employee) throw new SettingsError("SALARY_EMPLOYEE_NOT_AVAILABLE", 409);
  return employee;
}

async function scopedRole(tx: Prisma.TransactionClient, actor: SettingsActor, code: string) {
  const role = await tx.role.findFirst({ where: { tenantId: actor.tenantId, code }, select: { id: true, code: true } });
  if (!role) throw new SettingsError("ROLE_NOT_FOUND", 404);
  return role;
}

async function protectLastOwner(tx: Prisma.TransactionClient, actor: SettingsActor, userId: string, nextRole: string, nextStatus: "ACTIVE" | "SUSPENDED") {
  const currentOwner = await tx.userRole.findFirst({ where: { userId, role: { tenantId: actor.tenantId, code: "OWNER" } }, select: { userId: true } });
  if (!currentOwner || (nextRole === "OWNER" && nextStatus === "ACTIVE")) return;
  const activeOwners = await tx.user.count({ where: { tenantId: actor.tenantId, status: "ACTIVE", roles: { some: { role: { code: "OWNER" } } } } });
  if (activeOwners <= 1) throw new SettingsError("LAST_ACTIVE_OWNER", 409);
}

export async function createSettingsUser(actor: SettingsActor, input: UserCreateInput) {
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  return prisma.$transaction(async (tx) => {
    const roleCode = requestedRoleCode(input);
    const role = await scopedRole(tx, actor, roleCode);
    if (input.userType === "TEAM_PWA") await scopedActiveEmployee(tx, actor, input.salaryEmployeeId!);
    const user = await tx.user.create({
      data: { tenantId: actor.tenantId, outletId: actor.outletId, name: input.name, email: input.email.toLowerCase(), passwordHash, status: input.status },
      select: { id: true },
    });
    await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
    if (input.userType === "TEAM_PWA") {
      await tx.teamMembership.create({ data: { tenantId: actor.tenantId, outletId: actor.outletId, userId: user.id, salaryEmployeeId: input.salaryEmployeeId! } });
    }
    await audit(tx, actor, "CREATE", "SETTINGS_USER", user.id, ["name", "email", "status", "role", ...(input.userType === "TEAM_PWA" ? ["teamMembership"] : [])]);
    return tx.user.findUniqueOrThrow({ where: { id: user.id }, select: settingsUserSelect });
  }, { isolationLevel: "Serializable" });
}

export async function updateSettingsUser(actor: SettingsActor, userId: string, input: UserInput) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.user.findFirst({
      where: { id: userId, tenantId: actor.tenantId, outletId: actor.outletId },
      include: { roles: { include: { role: true } }, teamMemberships: { where: { status: "ACTIVE" } } },
    });
    if (!current) throw new SettingsError("USER_NOT_FOUND", 404);
    const roleCode = requestedRoleCode(input);
    const role = await scopedRole(tx, actor, roleCode);
    await protectLastOwner(tx, actor, current.id, roleCode, input.status);

    let membershipChanged = false;
    const activeMembership = current.teamMemberships[0] ?? null;
    if (input.userType === "TEAM_PWA") {
      await scopedActiveEmployee(tx, actor, input.salaryEmployeeId!);
      if (activeMembership?.salaryEmployeeId !== input.salaryEmployeeId) {
        if (activeMembership) await tx.teamMembership.update({ where: { id: activeMembership.id }, data: { status: "INACTIVE", effectiveUntil: new Date() } });
        await tx.teamMembership.create({ data: { tenantId: actor.tenantId, outletId: actor.outletId, userId: current.id, salaryEmployeeId: input.salaryEmployeeId! } });
        membershipChanged = true;
      }
    } else if (activeMembership) {
      await tx.teamMembership.update({ where: { id: activeMembership.id }, data: { status: "INACTIVE", effectiveUntil: new Date() } });
      membershipChanged = true;
    }

    const previousRole = current.roles[0]?.role.code ?? null;
    await tx.user.update({ where: { id: current.id }, data: { name: input.name, email: input.email.toLowerCase(), status: input.status } });
    if (previousRole !== role.code) {
      await tx.userRole.deleteMany({ where: { userId: current.id, role: { tenantId: actor.tenantId } } });
      await tx.userRole.create({ data: { userId: current.id, roleId: role.id } });
    }
    if (input.status !== "ACTIVE" || previousRole !== role.code || membershipChanged) await tx.userSession.deleteMany({ where: { userId: current.id } });
    await audit(tx, actor, "UPDATE", "SETTINGS_USER", current.id, ["name", "email", "status", "role", ...(membershipChanged ? ["teamMembership"] : [])]);
    return tx.user.findUniqueOrThrow({ where: { id: current.id }, select: settingsUserSelect });
  }, { isolationLevel: "Serializable" });
}

export async function setSettingsUserStatus(actor: SettingsActor, userId: string, status: "ACTIVE" | "SUSPENDED") {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findFirst({
      where: { id: userId, tenantId: actor.tenantId, outletId: actor.outletId },
      include: { roles: { include: { role: true } }, teamMemberships: { where: { status: "ACTIVE" }, select: { id: true } } },
    });
    if (!user) throw new SettingsError("USER_NOT_FOUND", 404);
    const roleCode = user.roles[0]?.role.code ?? "";
    await protectLastOwner(tx, actor, user.id, roleCode, status);
    if (status === "ACTIVE" && roleCode === "TEAM" && user.teamMemberships.length !== 1) throw new SettingsError("TEAM_MEMBERSHIP_REQUIRED", 409);
    await tx.user.update({ where: { id: user.id }, data: { status } });
    if (status !== "ACTIVE") await tx.userSession.deleteMany({ where: { userId: user.id } });
    await audit(tx, actor, "UPDATE", "SETTINGS_USER", user.id, ["status"]);
    return { success: true, status };
  }, { isolationLevel: "Serializable" });
}

export async function resetSettingsUserPassword(actor: SettingsActor, userId: string, password: string) {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findFirst({ where: { id: userId, tenantId: actor.tenantId, outletId: actor.outletId }, select: { id: true } });
    if (!user) throw new SettingsError("USER_NOT_FOUND", 404);
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    await tx.userSession.deleteMany({ where: { userId: user.id } });
    await audit(tx, actor, "UPDATE", "SETTINGS_USER_CREDENTIAL", user.id, ["credentials"]);
    return { success: true };
  });
}

export const listBankAccounts = (scope: SettingsScope) => prisma.outletBankAccount.findMany({ where: buildTenantOutletWhere(scope), orderBy: [{ displayOrder: "asc" }, { bankName: "asc" }] });
export async function createBankAccount(actor: SettingsActor, input: BankInput) { return prisma.$transaction(async (tx) => { const scope = { tenantId: actor.tenantId, outletId: actor.outletId }; if (input.isDefault) await tx.outletBankAccount.updateMany({ where: scope, data: { isDefault: false } }); const item = await tx.outletBankAccount.create({ data: { ...input, ...scope } }); await audit(tx, actor, "CREATE", "SETTINGS_BANK_ACCOUNT", item.id, Object.keys(input)); return item; }); }
export async function updateBankAccount(actor: SettingsActor, id: string, input: BankInput) { return prisma.$transaction(async (tx) => { const scope = { tenantId: actor.tenantId, outletId: actor.outletId }; const found = await tx.outletBankAccount.findFirst({ where: { id, ...scope } }); if (!found) throw new SettingsError("BANK_ACCOUNT_NOT_FOUND", 404); if (input.isDefault) await tx.outletBankAccount.updateMany({ where: scope, data: { isDefault: false } }); const item = await tx.outletBankAccount.update({ where: { id }, data: input }); await audit(tx, actor, "UPDATE", "SETTINGS_BANK_ACCOUNT", id, Object.keys(input)); return item; }); }

export const listFinancialCategories = (scope: SettingsScope) => prisma.financialCategory.findMany({ where: buildTenantOutletWhere(scope), orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { name: "asc" }] });
export async function createFinancialCategory(actor: SettingsActor, input: CategoryInput) { return prisma.$transaction(async (tx) => { const name = normalizeFinancialCategory(input.name); const item = await tx.financialCategory.create({ data: { ...input, name, canonicalName: canonicalizeFinancialCategory(name), tenantId: actor.tenantId, outletId: actor.outletId } }); await audit(tx, actor, "CREATE", "SETTINGS_FINANCIAL_CATEGORY", item.id, Object.keys(input)); return item; }); }
export async function updateFinancialCategory(actor: SettingsActor, id: string, input: CategoryInput) { return prisma.$transaction(async (tx) => { const found = await tx.financialCategory.findFirst({ where: { id, tenantId: actor.tenantId, outletId: actor.outletId } }); if (!found) throw new SettingsError("FINANCIAL_CATEGORY_NOT_FOUND", 404); const name = normalizeFinancialCategory(input.name); const item = await tx.financialCategory.update({ where: { id }, data: { ...input, name, canonicalName: canonicalizeFinancialCategory(name) } }); await audit(tx, actor, "UPDATE", "SETTINGS_FINANCIAL_CATEGORY", id, Object.keys(input)); return item; }); }

function middlewareHostMasked(value?: string) {
  if (!value) return null;
  try {
    const hostname = new URL(value).hostname;
    const labels = hostname.split(".");
    if (labels.length < 2) return "configured-host";
    const prefix = labels[0].split("-")[0].slice(0, 12) || "host";
    return `${prefix}-***.${labels.slice(1).join(".")}`;
  } catch { return "configured-host"; }
}

function applicationDomain(value?: string) {
  if (!value) return null;
  try { return new URL(value).hostname; } catch { return null; }
}

async function middlewareHealth(base?: string): Promise<"ONLINE" | "OFFLINE" | "NOT_CONFIGURED"> {
  if (!base) return "NOT_CONFIGURED";
  try {
    const response = await fetch(new URL("/", base), { method: "GET", signal: AbortSignal.timeout(5000), cache: "no-store" });
    return response.status < 500 ? "ONLINE" : "OFFLINE";
  } catch { return "OFFLINE"; }
}

type OperationalSyncView = {
  id: string;
  runType: "FULL" | "PICKUP" | "DISPATCH" | "COD";
  status: "RUNNING" | "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
  startedAt: Date;
  completedAt: Date | null;
  pickupFetchedCount: number;
  dispatchFetchedCount: number;
  codFetchedCount: number;
  anomalyCount: number;
};

function canonicalDatasetStatus(status?: OperationalSyncView["status"]): IntegrationDatasetStatus {
  if (!status) return "NEVER_SYNCED";
  if (status === "PARTIAL_SUCCESS") return "STALE";
  return status;
}

function operationalDataset(
  rows: OperationalSyncView[],
  key: "PICKUP" | "DISPATCH" | "COD",
  label: string,
  countField: "pickupFetchedCount" | "dispatchFetchedCount" | "codFetchedCount",
): IntegrationDatasetView {
  const run = rows.find((item) => item.runType === key || item.runType === "FULL");
  const status = canonicalDatasetStatus(run?.status);
  return {
    key, label, status,
    lastSyncedAt: run?.completedAt ?? run?.startedAt ?? null,
    resultSummary: !run ? "Belum pernah memiliki SyncRun." : run.status === "PARTIAL_SUCCESS" ? `Selesai dengan ${run.anomalyCount} anomali.` : run.status === "FAILED" ? "Sinkronisasi terakhir gagal." : run.status === "RUNNING" ? "Sinkronisasi sedang berjalan." : "Sinkronisasi selesai.",
    recordCount: run?.[countField] ?? null,
    errorCode: run?.status === "FAILED" ? "SYNC_FAILED" : run?.status === "PARTIAL_SUCCESS" ? "PARTIAL_SUCCESS" : null,
    detailAvailable: Boolean(run),
  };
}

function unavailableDataset(key: "SLA" | "OMS" | "AGING_SIGN" | "INVENTORY", label: string): IntegrationDatasetView {
  return { key, label, status: "UNAVAILABLE", lastSyncedAt: null, resultSummary: "Belum tersedia karena belum ada SyncRun canonical.", recordCount: null, errorCode: null, detailAvailable: false };
}

function safeActivityStatus(status: OperationalSyncView["status"]): IntegrationActivityView["status"] {
  if (status === "RUNNING") return "RUNNING";
  if (status === "FAILED") return "FAILED";
  return "SUCCESS";
}

function latestDate(values: Array<Date | null | undefined>) {
  const timestamps = values.filter((value): value is Date => value instanceof Date).map((value) => value.getTime());
  return timestamps.length ? new Date(Math.max(...timestamps)) : null;
}

function safeIntegrationErrorCode(value: string | null | undefined) {
  return value && /^[A-Z0-9_:-]{1,80}$/.test(value) ? value : "SYNC_FAILED";
}

export async function getIntegrationStatus(scope: SettingsScope): Promise<IntegrationControlCenter & Record<string, unknown>> {
  const where = buildTenantOutletWhere(scope);
  const now = new Date();
  const middlewareUrl = process.env.JFS_MIDDLEWARE_BASE_URL ?? process.env.JFS_MIDDLEWARE_URL;
  const appDomain = applicationDomain(process.env.SALARY_PUBLIC_BASE_URL ?? process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL);
  const [outlet, operationalRuns, cashflowRuns, activeShares, integrationAudits, middlewareStatus] = await Promise.all([
    prisma.outlet.findFirst({ where: buildOutletWhere(scope), select: { id: true, code: true } }),
    prisma.syncRun.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: 20,
      select: { id: true, runType: true, status: true, startedAt: true, completedAt: true, pickupFetchedCount: true, dispatchFetchedCount: true, codFetchedCount: true, anomalyCount: true },
    }),
    prisma.jfsCashflowSyncRun.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: 10,
      select: { id: true, status: true, startedAt: true, completedAt: true, fetchedCount: true, anomalyCount: true, errorCode: true },
    }),
    prisma.salaryPublicationShare.count({ where: { ...where, revokedAt: null, expiresAt: { gt: now } } }),
    prisma.auditLog.findMany({
      where: {
        tenantId: scope.tenantId,
        AND: [
          { OR: [{ outletId: scope.outletId }, { outletId: null }] },
          { OR: [
            { entityType: { contains: "INTEGRATION", mode: "insensitive" } },
            { entityType: { contains: "CONNECTION", mode: "insensitive" } },
            { entityType: { contains: "CREDENTIAL", mode: "insensitive" } },
          ] },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, createdAt: true, entityType: true, action: true },
    }),
    middlewareHealth(middlewareUrl),
  ]);
  if (!outlet) throw new SettingsError("SETTINGS_SCOPE_NOT_FOUND", 404);

  const pickup = operationalDataset(operationalRuns, "PICKUP", "Pickup", "pickupFetchedCount");
  const dispatch = operationalDataset(operationalRuns, "DISPATCH", "Dispatch", "dispatchFetchedCount");
  const cod = operationalDataset(operationalRuns, "COD", "COD", "codFetchedCount");
  const cashflowRun = cashflowRuns[0] ?? null;
  const cashflow: IntegrationDatasetView = {
    key: "CASHFLOW", label: "Cashflow", status: canonicalDatasetStatus(cashflowRun?.status),
    lastSyncedAt: cashflowRun?.completedAt ?? cashflowRun?.startedAt ?? null,
    resultSummary: !cashflowRun ? "Belum pernah memiliki JfsCashflowSyncRun." : cashflowRun.status === "PARTIAL_SUCCESS" ? `Selesai dengan ${cashflowRun.anomalyCount} anomali.` : cashflowRun.status === "FAILED" ? "Sinkronisasi terakhir gagal." : cashflowRun.status === "RUNNING" ? "Sinkronisasi sedang berjalan." : "Sinkronisasi selesai.",
    recordCount: cashflowRun?.fetchedCount ?? null,
    errorCode: cashflowRun?.status === "FAILED" ? safeIntegrationErrorCode(cashflowRun.errorCode) : cashflowRun?.status === "PARTIAL_SUCCESS" ? "PARTIAL_SUCCESS" : null,
    detailAvailable: Boolean(cashflowRun),
  };
  const datasets = [pickup, dispatch, cod, cashflow,
    unavailableDataset("SLA", "SLA"),
    unavailableDataset("OMS", "OMS / Pickup Scheduling"),
    unavailableDataset("AGING_SIGN", "Aging Sign"),
    unavailableDataset("INVENTORY", "Inventory / Waybill Stuck")];

  const runActivities: IntegrationActivityView[] = operationalRuns.map((run) => ({
    id: `sync-${run.id}`, occurredAt: run.completedAt ?? run.startedAt, integration: run.runType === "FULL" ? "Operasional" : run.runType,
    activity: "Sinkronisasi", status: safeActivityStatus(run.status),
    summary: run.status === "FAILED" ? "Sinkronisasi gagal dengan kode aman SYNC_FAILED." : run.status === "RUNNING" ? "Sinkronisasi sedang berjalan." : `Sinkronisasi selesai; ${run.pickupFetchedCount + run.dispatchFetchedCount + run.codFetchedCount} record diambil.`,
  }));
  const cashflowActivities: IntegrationActivityView[] = cashflowRuns.map((run) => ({
    id: `cashflow-${run.id}`, occurredAt: run.completedAt ?? run.startedAt, integration: "Cashflow", activity: "Sinkronisasi", status: safeActivityStatus(run.status),
    summary: run.status === "FAILED" ? `Sinkronisasi gagal dengan kode aman ${safeIntegrationErrorCode(run.errorCode)}.` : run.status === "RUNNING" ? "Sinkronisasi sedang berjalan." : `Sinkronisasi selesai; ${run.fetchedCount} record diambil.`,
  }));
  const auditActivities: IntegrationActivityView[] = integrationAudits.map((row) => ({
    id: `audit-${row.id.toString()}`, occurredAt: row.createdAt, integration: row.entityType.replaceAll("_", " "), activity: row.action,
    status: "INFO", summary: "Aktivitas integrasi tercatat. Metadata sensitif tidak ditampilkan.",
  }));
  const activities = [...runActivities, ...cashflowActivities, ...auditActivities].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()).slice(0, 10);
  const successfulDates = [...operationalRuns, ...cashflowRuns].filter(({ status }) => status === "SUCCESS" || status === "PARTIAL_SUCCESS").map((run) => run.completedAt);
  const failedDates = [...operationalRuns, ...cashflowRuns].filter(({ status }) => status === "FAILED").map((run) => run.completedAt);
  const operationalLast = operationalRuns[0]?.completedAt ?? operationalRuns[0]?.startedAt ?? null;
  const cashflowLast = cashflowRuns[0]?.completedAt ?? cashflowRuns[0]?.startedAt ?? null;
  const databaseStatus = "CONNECTED" as const;
  const salaryCardStatus = activeShares > 0 ? "ACTIVE" as const : "READY" as const;
  const jfsConnection = await getJfsIntegrationStatus(scope).catch(() => ({
    available: true,
    connected: false,
    outletCode: outlet.code,
    networkCode: null,
    status: "DISCONNECTED" as const,
    accountMasked: null,
    lastConnectedAt: null,
    lastTestedAt: null,
  }));

  return {
    summary: { jfsConnectionStatus: jfsConnection.status, middlewareStatus, databaseStatus, applicationDomain: appDomain },
    connection: jfsConnection,
    datasets,
    infrastructure: {
      middlewareHostMasked: middlewareHostMasked(middlewareUrl), middlewareStatus, databaseStatus, applicationDomain: appDomain, salaryCardStatus,
      cron: [{ key: "CASHFLOW", lastRunAt: cashflowLast }, { key: "OPERATIONAL", lastRunAt: operationalLast }],
      lastSuccessfulSync: latestDate(successfulDates), lastFailedSync: latestDate(failedDates),
    },
    activities,
    // Legacy read-only keys are retained while existing consumers move to the canonical contract.
    middleware: { status: middlewareStatus, host: middlewareHostMasked(middlewareUrl) },
    database: { status: databaseStatus },
    application: { domain: appDomain },
    salaryWhatsapp: { status: salaryCardStatus, activeShares },
    sync: { lastSuccessful: latestDate(successfulDates), lastFailed: latestDate(failedDates) },
    cron: { jfsCashflow: cashflowLast, operational: operationalLast },
  };
}

export async function testSettingsConnections(scope: SettingsScope) {
  const database = await prisma.outlet.count({ where: { id: scope.outletId, tenantId: scope.tenantId } });
  const middleware = await middlewareHealth(process.env.JFS_MIDDLEWARE_BASE_URL ?? process.env.JFS_MIDDLEWARE_URL);
  return { database: database === 1 ? "CONNECTED" : "SCOPED_OUTLET_NOT_FOUND", middleware: middleware === "ONLINE" ? "REACHABLE" : middleware === "OFFLINE" ? "UNREACHABLE" : "NOT_CONFIGURED" };
}

const sensitiveKey = /password|token|credential|secret|authorization|cookie|hash|database.?url|payload/i;
export function sanitizeAuditMetadata(value: unknown, depth = 0): unknown { if (depth > 4) return "[TRUNCATED]"; if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeAuditMetadata(item, depth + 1)); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !sensitiveKey.test(key)).map(([key, item]) => [key, sanitizeAuditMetadata(item, depth + 1)])); if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}…` : value; return value; }
export async function listAuditLogs(scope: SettingsScope, query: AuditQuery) { const where: Prisma.AuditLogWhereInput = { tenantId: scope.tenantId, OR: [{ outletId: scope.outletId }, { outletId: null }], ...(query.actorId ? { actorId: query.actorId } : {}), ...(query.entityType ? { entityType: { contains: query.entityType, mode: "insensitive" } } : {}), ...(query.action ? { action: query.action } : {}), ...(query.startDate || query.endDate ? { createdAt: { ...(query.startDate ? { gte: new Date(`${query.startDate}T00:00:00+07:00`) } : {}), ...(query.endDate ? { lte: new Date(`${query.endDate}T23:59:59.999+07:00`) } : {}) } } : {}) }; const [rows, total] = await Promise.all([prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { actor: { select: { id: true, name: true } }, outlet: { select: { code: true, name: true } } } }), prisma.auditLog.count({ where })]); return { data: rows.map((row) => ({ ...row, id: row.id.toString(), metadata: sanitizeAuditMetadata(row.metadata) })), pagination: { page: query.page, pageSize: query.pageSize, total } }; }
