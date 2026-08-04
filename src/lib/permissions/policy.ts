import type { SessionContext } from "@/lib/auth/session";
import type { RoleCode } from "./roles";

export const permissionResources = [
  "DASHBOARD",
  "MONITORING",
  "DELIVERY_SETTLEMENT",
  "PICKUP_SETTLEMENT",
  "OPERATIONAL_SETTLEMENT",
  "PAYMENT_SETTLEMENT",
  "PICKUP_PAYMENT",
  "QUALITY_CONTROL",
  "OPERATIONAL_DETAIL",
  "PROFIT_LOSS",
  "INVOICE",
  "SALARY_SETTING",
  "SALARY_CLOSING",
  "SALARY_RECAP",
  "SETTINGS_PROFILE",
  "SETTINGS_USERS",
  "SETTINGS_FINANCE",
  "SETTINGS_INTEGRATIONS",
  "SETTINGS_MAINTENANCE",
  "SETTINGS_AUDIT",
  "SETTINGS_TARGET_KPI",
  "USER_PROFILE",
  "TEAM_PORTAL",
] as const;

export const permissionActions = [
  "READ",
  "CREATE",
  "UPDATE",
  "DELETE",
  "VOID",
  "APPROVE",
  "FINALIZE",
  "EXPORT",
  "MANAGE",
] as const;

export type PermissionResource = (typeof permissionResources)[number];
export type PermissionAction = (typeof permissionActions)[number];

const fullAccessRoles = new Set<RoleCode>(["SUPER_ADMIN", "OWNER", "FINANCE", "HR", "QC"]);
const adminRestricted = new Set<PermissionResource>([
  "PROFIT_LOSS",
  "SALARY_SETTING",
  "SALARY_CLOSING",
  "SALARY_RECAP",
]);
const settingsResources = new Set<PermissionResource>(permissionResources.filter(
  (resource) => resource.startsWith("SETTINGS_"),
));
const operationalResources = new Set<PermissionResource>([
  "DASHBOARD",
  "MONITORING",
  "DELIVERY_SETTLEMENT",
  "PICKUP_SETTLEMENT",
  "OPERATIONAL_SETTLEMENT",
  "PAYMENT_SETTLEMENT",
  "PICKUP_PAYMENT",
  "QUALITY_CONTROL",
  "OPERATIONAL_DETAIL",
  "INVOICE",
  "USER_PROFILE",
]);

function operationalCan(resource: PermissionResource, action: PermissionAction) {
  if (!operationalResources.has(resource)) return false;
  if (action === "READ") return true;
  if (resource === "USER_PROFILE") return action === "UPDATE";
  if (resource === "DASHBOARD") return false;
  if (resource === "PAYMENT_SETTLEMENT") return action === "CREATE";
  if (resource === "OPERATIONAL_DETAIL") return action === "EXPORT";
  if (resource === "INVOICE") return ["CREATE", "UPDATE", "EXPORT", "MANAGE"].includes(action);
  if (["MONITORING", "PICKUP_SETTLEMENT", "QUALITY_CONTROL"].includes(resource)) return action === "MANAGE";
  if (resource === "DELIVERY_SETTLEMENT") return action === "MANAGE";
  if (resource === "OPERATIONAL_SETTLEMENT") return ["CREATE", "UPDATE", "MANAGE"].includes(action);
  if (resource === "PICKUP_PAYMENT") return action === "CREATE";
  return false;
}

function roleCan(role: RoleCode, resource: PermissionResource, action: PermissionAction) {
  if (fullAccessRoles.has(role)) return resource !== "TEAM_PORTAL";
  if (role === "TEAM") return resource === "TEAM_PORTAL" && action === "READ";
  if (role === "VIEWER") {
    if (resource === "USER_PROFILE") return action === "READ" || action === "UPDATE";
    return !settingsResources.has(resource) && resource !== "TEAM_PORTAL" && action === "READ";
  }
  if (role === "ADMIN") return resource !== "TEAM_PORTAL" && !adminRestricted.has(resource);
  if (role === "OPERATIONAL") return operationalCan(resource, action);
  return false;
}

export function canAccessResource(
  roles: readonly string[],
  resource: PermissionResource,
  action: PermissionAction = "READ",
) {
  return roles.some((role) => roleCan(role as RoleCode, resource, action));
}

export class ResourcePermissionError extends Error {
  readonly code = "FORBIDDEN";
  readonly status = 403;

  constructor(
    readonly resource: PermissionResource,
    readonly action: PermissionAction,
  ) {
    super("FORBIDDEN");
  }
}

export function requireResourcePermission(
  session: Pick<SessionContext, "roles">,
  resource: PermissionResource,
  action: PermissionAction = "READ",
) {
  if (!canAccessResource(session.roles, resource, action)) {
    throw new ResourcePermissionError(resource, action);
  }
  return session;
}
