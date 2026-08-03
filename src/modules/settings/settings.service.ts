import argon2 from "argon2";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { buildOutletWhere, buildTenantOutletWhere, type SettingsActor, type SettingsScope } from "./settings.types";
import type { z } from "zod";
import type { auditLogQuerySchema, bankAccountSchema, businessProfileSchema, financialCategorySchema, userUpdateSchema } from "./settings.validation";

type BusinessInput = z.infer<typeof businessProfileSchema>;
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

export const listSettingsUsers = (scope: SettingsScope) => prisma.user.findMany({ where: { tenantId: scope.tenantId, outletId: scope.outletId }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true, status: true, lastLoginAt: true, outlet: { select: { id: true, code: true, name: true } }, roles: { select: { role: { select: { code: true, name: true } } } } } });

export async function updateSettingsUser(actor: SettingsActor, userId: string, input: UserInput) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.user.findFirst({ where: { id: userId, tenantId: actor.tenantId, outletId: actor.outletId }, include: { roles: { include: { role: true } } } });
    if (!current) throw new SettingsError("USER_NOT_FOUND", 404);
    const role = await tx.role.findFirst({ where: { tenantId: actor.tenantId, code: input.roleCode }, select: { id: true, code: true } });
    if (!role) throw new SettingsError("ROLE_NOT_FOUND", 404);
    const wasOwner = current.roles.some(({ role }) => role.code === "OWNER");
    if (wasOwner && (input.status !== "ACTIVE" || role.code !== "OWNER")) {
      const activeOwners = await tx.user.count({ where: { tenantId: actor.tenantId, status: "ACTIVE", roles: { some: { role: { code: "OWNER" } } } } });
      if (activeOwners <= 1) throw new SettingsError("LAST_ACTIVE_OWNER", 409);
    }
    const user = await tx.user.update({ where: { id: current.id }, data: { name: input.name, email: input.email, status: input.status }, select: { id: true, name: true, email: true, status: true } });
    await tx.userRole.deleteMany({ where: { userId: current.id, role: { tenantId: actor.tenantId } } });
    await tx.userRole.create({ data: { userId: current.id, roleId: role.id } });
    await audit(tx, actor, "UPDATE", "SETTINGS_USER", current.id, ["name", "email", "status", "role"]);
    return { ...user, role: role.code };
  });
}

export async function resetSettingsUserPassword(actor: SettingsActor, userId: string, password: string) {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findFirst({ where: { id: userId, tenantId: actor.tenantId, outletId: actor.outletId }, select: { id: true } });
    if (!user) throw new SettingsError("USER_NOT_FOUND", 404);
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    await audit(tx, actor, "UPDATE", "SETTINGS_USER_PASSWORD", user.id, ["password"]);
    return { success: true };
  });
}

export const listBankAccounts = (scope: SettingsScope) => prisma.outletBankAccount.findMany({ where: buildTenantOutletWhere(scope), orderBy: [{ displayOrder: "asc" }, { bankName: "asc" }] });
export async function createBankAccount(actor: SettingsActor, input: BankInput) { return prisma.$transaction(async (tx) => { const scope = { tenantId: actor.tenantId, outletId: actor.outletId }; if (input.isDefault) await tx.outletBankAccount.updateMany({ where: scope, data: { isDefault: false } }); const item = await tx.outletBankAccount.create({ data: { ...input, ...scope } }); await audit(tx, actor, "CREATE", "SETTINGS_BANK_ACCOUNT", item.id, Object.keys(input)); return item; }); }
export async function updateBankAccount(actor: SettingsActor, id: string, input: BankInput) { return prisma.$transaction(async (tx) => { const scope = { tenantId: actor.tenantId, outletId: actor.outletId }; const found = await tx.outletBankAccount.findFirst({ where: { id, ...scope } }); if (!found) throw new SettingsError("BANK_ACCOUNT_NOT_FOUND", 404); if (input.isDefault) await tx.outletBankAccount.updateMany({ where: scope, data: { isDefault: false } }); const item = await tx.outletBankAccount.update({ where: { id }, data: input }); await audit(tx, actor, "UPDATE", "SETTINGS_BANK_ACCOUNT", id, Object.keys(input)); return item; }); }

export const listFinancialCategories = (scope: SettingsScope) => prisma.financialCategory.findMany({ where: buildTenantOutletWhere(scope), orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { name: "asc" }] });
export async function createFinancialCategory(actor: SettingsActor, input: CategoryInput) { return prisma.$transaction(async (tx) => { const name = normalizeFinancialCategory(input.name); const item = await tx.financialCategory.create({ data: { ...input, name, canonicalName: canonicalizeFinancialCategory(name), tenantId: actor.tenantId, outletId: actor.outletId } }); await audit(tx, actor, "CREATE", "SETTINGS_FINANCIAL_CATEGORY", item.id, Object.keys(input)); return item; }); }
export async function updateFinancialCategory(actor: SettingsActor, id: string, input: CategoryInput) { return prisma.$transaction(async (tx) => { const found = await tx.financialCategory.findFirst({ where: { id, tenantId: actor.tenantId, outletId: actor.outletId } }); if (!found) throw new SettingsError("FINANCIAL_CATEGORY_NOT_FOUND", 404); const name = normalizeFinancialCategory(input.name); const item = await tx.financialCategory.update({ where: { id }, data: { ...input, name, canonicalName: canonicalizeFinancialCategory(name) } }); await audit(tx, actor, "UPDATE", "SETTINGS_FINANCIAL_CATEGORY", id, Object.keys(input)); return item; }); }

function maskHost(value?: string) { if (!value) return null; try { const url = new URL(value); return `${url.protocol}//***.${url.hostname.split(".").slice(-2).join(".")}`; } catch { return "configured"; } }
export async function getIntegrationStatus(scope: SettingsScope) {
  const where = buildTenantOutletWhere(scope);
  const [latestSuccess, latestFailure, cashflowSuccess, cashflowFailure, shares] = await Promise.all([
    prisma.syncRun.findFirst({ where: { ...where, status: "SUCCESS" }, orderBy: { completedAt: "desc" }, select: { completedAt: true, runType: true } }),
    prisma.syncRun.findFirst({ where: { ...where, status: "FAILED" }, orderBy: { completedAt: "desc" }, select: { completedAt: true, runType: true } }),
    prisma.jfsCashflowSyncRun.findFirst({ where: { ...where, status: "SUCCESS" }, orderBy: { completedAt: "desc" }, select: { completedAt: true } }),
    prisma.jfsCashflowSyncRun.findFirst({ where: { ...where, status: "FAILED" }, orderBy: { completedAt: "desc" }, select: { completedAt: true } }),
    prisma.salaryPublicationShare.count({ where: { ...where, revokedAt: null, expiresAt: { gt: new Date() } } }),
  ]);
  const middlewareUrl = process.env.JFS_MIDDLEWARE_BASE_URL ?? process.env.JFS_MIDDLEWARE_URL;
  return { middleware: { status: middlewareUrl ? "CONFIGURED" : "NOT_CONFIGURED", host: maskHost(middlewareUrl) }, database: { status: "CONNECTED" }, application: { domain: maskHost(process.env.SALARY_PUBLIC_BASE_URL ?? process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL) }, salaryWhatsapp: { status: shares > 0 ? "ACTIVE" : "READY", activeShares: shares }, sync: { lastSuccessful: latestSuccess ?? cashflowSuccess, lastFailed: latestFailure ?? cashflowFailure }, cron: { jfsCashflow: cashflowSuccess?.completedAt ?? cashflowFailure?.completedAt ?? null, operational: latestSuccess?.completedAt ?? latestFailure?.completedAt ?? null } };
}
export async function testSettingsConnections(scope: SettingsScope) { const database = await prisma.outlet.count({ where: { id: scope.outletId, tenantId: scope.tenantId } }); let middleware: "NOT_CONFIGURED" | "REACHABLE" | "UNREACHABLE" = "NOT_CONFIGURED"; const base = process.env.JFS_MIDDLEWARE_BASE_URL ?? process.env.JFS_MIDDLEWARE_URL; if (base) { try { const response = await fetch(new URL("/", base), { method: "GET", signal: AbortSignal.timeout(5000), cache: "no-store" }); middleware = response.status < 500 ? "REACHABLE" : "UNREACHABLE"; } catch { middleware = "UNREACHABLE"; } } return { database: database === 1 ? "CONNECTED" : "SCOPED_OUTLET_NOT_FOUND", middleware }; }

const range = { _min: { createdAt: true }, _max: { createdAt: true }, _count: { _all: true } } as const;
export async function getMaintenancePreview(scope: SettingsScope) {
  const old = new Date(Date.now() - 90 * 86400000);
  const now = new Date();
  const where = buildTenantOutletWhere(scope);
  const [salaryVoid, expiredShares, revokedShares, manualVoid, adjustmentVoid, oldSync] = await Promise.all([
    prisma.salaryClosing.aggregate({ where: { ...where, status: "VOID" }, ...range }),
    prisma.salaryPublicationShare.aggregate({ where: { ...where, expiresAt: { lte: now } }, ...range }),
    prisma.salaryPublicationShare.aggregate({ where: { ...where, revokedAt: { not: null } }, ...range }),
    prisma.profitLossManualEntry.aggregate({ where: { ...where, status: "VOID" }, ...range }),
    prisma.profitLossAdjustment.aggregate({ where: { ...where, status: "VOID" }, ...range }),
    prisma.syncRun.aggregate({ where: { ...where, createdAt: { lt: old } }, ...range }),
  ]);
  const candidate = (key: string, label: string, value: typeof salaryVoid, safe: boolean, blocker: string | null) => ({ key, label, count: value._count._all, oldest: value._min.createdAt, newest: value._max.createdAt, safe, blocker });
  return { cache: { available: false, message: "Tidak ada cache aplikasi yang dapat dibersihkan" }, deletionEnabled: false, deletionMessage: "Penghapusan akan tersedia setelah verifikasi.", candidates: [candidate("salaryClosingVoid", "Salary Closing VOID", salaryVoid, false, "Relasi Salary harus diverifikasi"), candidate("salaryPublicationShareExpired", "Salary Publication Share expired", expiredShares, false, "Histori publikasi harus dipertahankan"), candidate("salaryPublicationShareRevoked", "Salary Publication Share revoked", revokedShares, false, "Histori publikasi harus dipertahankan"), { key: "salaryRecapTest", label: "Salary Closing/Recap testing", count: 0, oldest: null, newest: null, safe: false, blocker: "Tidak ada status khusus data testing" }, candidate("profitLossManualVoid", "Profit Loss Manual VOID", manualVoid, false, "Histori audit dipertahankan"), candidate("profitLossAdjustmentVoid", "Profit Loss Adjustment VOID", adjustmentVoid, false, "Histori audit dipertahankan"), candidate("oldSyncRuns", "SyncRun lebih dari 90 hari", oldSync, false, "Relasi source record harus diverifikasi")] };
}
export async function simulateMaintenance(scope: SettingsScope) { const preview = await getMaintenancePreview(scope); return { simulatedAt: new Date(), writesPerformed: 0, candidates: preview.candidates.map((item) => ({ ...item, tables: [item.key], relationsAffected: [], result: item.safe ? "REVIEW_REQUIRED" : "BLOCKED" })) }; }

const sensitiveKey = /password|token|credential|secret|authorization|cookie|hash|database.?url|payload/i;
export function sanitizeAuditMetadata(value: unknown, depth = 0): unknown { if (depth > 4) return "[TRUNCATED]"; if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeAuditMetadata(item, depth + 1)); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !sensitiveKey.test(key)).map(([key, item]) => [key, sanitizeAuditMetadata(item, depth + 1)])); if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}…` : value; return value; }
export async function listAuditLogs(scope: SettingsScope, query: AuditQuery) { const where: Prisma.AuditLogWhereInput = { tenantId: scope.tenantId, OR: [{ outletId: scope.outletId }, { outletId: null }], ...(query.actorId ? { actorId: query.actorId } : {}), ...(query.entityType ? { entityType: { contains: query.entityType, mode: "insensitive" } } : {}), ...(query.action ? { action: query.action } : {}), ...(query.startDate || query.endDate ? { createdAt: { ...(query.startDate ? { gte: new Date(`${query.startDate}T00:00:00+07:00`) } : {}), ...(query.endDate ? { lte: new Date(`${query.endDate}T23:59:59.999+07:00`) } : {}) } } : {}) }; const [rows, total] = await Promise.all([prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { actor: { select: { id: true, name: true } }, outlet: { select: { code: true, name: true } } } }), prisma.auditLog.count({ where })]); return { data: rows.map((row) => ({ ...row, id: row.id.toString(), metadata: sanitizeAuditMetadata(row.metadata) })), pagination: { page: query.page, pageSize: query.pageSize, total } }; }
