export const ROLE_CODES = [
  "SUPER_ADMIN",
  "OWNER",
  "ADMIN",
  "FINANCE",
  "HR",
  "QC",
  "OPERATIONAL",
  "VIEWER",
  "TEAM",
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export function hasAnyRole(userRoles: string[], allowed: readonly RoleCode[]) {
  return userRoles.includes("SUPER_ADMIN") || allowed.some((role) => userRoles.includes(role));
}
