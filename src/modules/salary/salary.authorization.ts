import type { SessionContext } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/permissions/roles";

export const salaryPermissions = {
  settingRead: "salary.setting.read",
  settingManage: "salary.setting.manage",
  closingRead: "salary.closing.read",
  closingManage: "salary.closing.manage",
  adjustmentManage: "salary.adjustment.manage",
  process: "salary.process",
  recapRead: "salary.recap.read",
} as const;

const readers = ["OWNER", "ADMIN", "OPERATIONAL", "FINANCE", "VIEWER"] as const;
const managers = ["OWNER", "ADMIN"] as const;

export const canReadSalarySetting = (session: SessionContext) =>
  hasAnyRole(session.roles, readers);
export const canManageSalarySetting = (session: SessionContext) =>
  hasAnyRole(session.roles, managers);
export const canReadSalaryClosing = canReadSalarySetting;
export const canManageSalaryClosing = canManageSalarySetting;
export const canManageSalaryAdjustment = canManageSalarySetting;
export const canProcessSalary = canManageSalarySetting;
export const canReadSalaryRecap = canReadSalarySetting;

export const salaryScope = (session: SessionContext) =>
  session.outletId
    ? { tenantId: session.tenantId, outletId: session.outletId }
    : null;
