import type { SessionContext } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";
export const canReadSlaCutOff = (session: SessionContext) =>
  canAccessResource(session.roles, "QUALITY_CONTROL", "READ");
export const canSyncSlaCutOff = (session: SessionContext) =>
  canAccessResource(session.roles, "QUALITY_CONTROL", "MANAGE");
