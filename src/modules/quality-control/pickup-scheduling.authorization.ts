import type { SessionContext } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/permissions/roles";

const OPERATORS = ["OWNER", "ADMIN", "OPERATIONAL"] as const;

export const canReadPickupScheduling = (session: SessionContext) =>
  hasAnyRole(session.roles, [...OPERATORS, "VIEWER"]);
export const canSyncPickupScheduling = (session: SessionContext) =>
  hasAnyRole(session.roles, OPERATORS);
export const canViewPickupSchedulingSensitive = canSyncPickupScheduling;
