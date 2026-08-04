import type { SessionContext } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";

export const canReadPickupScheduling = (session: SessionContext) =>
  canAccessResource(session.roles, "QUALITY_CONTROL", "READ");
export const canSyncPickupScheduling = (session: SessionContext) =>
  canAccessResource(session.roles, "QUALITY_CONTROL", "MANAGE");
export const canViewPickupSchedulingSensitive = canSyncPickupScheduling;
