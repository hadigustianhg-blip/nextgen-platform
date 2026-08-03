import type { SessionContext } from "@/lib/auth/session";

export type SettingsScope = { tenantId: string; outletId: string };
export type SettingsActor = SettingsScope & { userId: string };

export function settingsScope(session: SessionContext): SettingsActor | null {
  return session.outletId
    ? { tenantId: session.tenantId, outletId: session.outletId, userId: session.userId }
    : null;
}
