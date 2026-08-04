import type { SessionContext } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";

export const canReadProblemWaybill = (session: SessionContext) =>
  canAccessResource(session.roles, "QUALITY_CONTROL", "READ");

export const canSyncProblemWaybill = (session: SessionContext) =>
  canAccessResource(session.roles, "QUALITY_CONTROL", "MANAGE");

export const canViewProblemWaybillSensitive = (session: SessionContext) =>
  canAccessResource(session.roles, "QUALITY_CONTROL", "MANAGE");
