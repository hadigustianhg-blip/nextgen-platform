import type { SessionContext } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";

export const salaryPermissions = {
  settingRead: "salary.setting.read",
  settingManage: "salary.setting.manage",
  closingRead: "salary.closing.read",
  closingManage: "salary.closing.manage",
  adjustmentManage: "salary.adjustment.manage",
  process: "salary.process",
  recapRead: "salary.recap.read",
} as const;

export const canReadSalarySetting = (session: SessionContext) =>
  canAccessResource(session.roles, "SALARY_SETTING", "READ");
export const canManageSalarySetting = (session: SessionContext) =>
  canAccessResource(session.roles, "SALARY_SETTING", "MANAGE");
export const canReadSalaryClosing = (session: SessionContext) =>
  canAccessResource(session.roles, "SALARY_CLOSING", "READ");
export const canManageSalaryClosing = (session: SessionContext) =>
  canAccessResource(session.roles, "SALARY_CLOSING", "MANAGE");
export const canManageSalaryAdjustment = canManageSalaryClosing;
export const canProcessSalary = (session: SessionContext) =>
  canAccessResource(session.roles, "SALARY_CLOSING", "FINALIZE");
export const canReadSalaryRecap = (session: SessionContext) =>
  canAccessResource(session.roles, "SALARY_RECAP", "READ");
export const canManageSalaryRecap = (session: SessionContext) =>
  canAccessResource(session.roles, "SALARY_RECAP", "MANAGE");

export const salaryScope = (session: SessionContext) =>
  session.outletId
    ? { tenantId: session.tenantId, outletId: session.outletId }
    : null;
