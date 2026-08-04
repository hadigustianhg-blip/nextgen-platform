import type { SessionContext } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";

export const canReadWaybillStuck = (session: SessionContext) =>
  canAccessResource(session.roles, "QUALITY_CONTROL", "READ");

export const canSyncWaybillStuck = (session: SessionContext) =>
  canAccessResource(session.roles, "QUALITY_CONTROL", "MANAGE");
