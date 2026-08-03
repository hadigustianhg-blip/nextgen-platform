import type { SessionContext } from "@/lib/auth/session";

export type SettingsScope = { tenantId: string; outletId: string };
export type SettingsActor = SettingsScope & { userId: string };

export function buildTenantOutletWhere(scope: SettingsScope): SettingsScope {
  return { tenantId: scope.tenantId, outletId: scope.outletId };
}

export function buildOutletWhere(scope: SettingsScope) {
  return { tenantId: scope.tenantId, id: scope.outletId };
}

export function settingsScope(session: SessionContext): SettingsActor | null {
  return session.outletId
    ? { tenantId: session.tenantId, outletId: session.outletId, userId: session.userId }
    : null;
}
