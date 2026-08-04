import { describe, expect, it } from "vitest";
import { canAccessResource, permissionActions, permissionResources } from "./policy";

describe("final role permission policy", () => {
  it.each(["OWNER", "SUPER_ADMIN", "HR"])("grants %s full admin access", (role) => {
    for (const resource of permissionResources.filter((item) => item !== "TEAM_PORTAL")) {
      for (const action of permissionActions) expect(canAccessResource([role], resource, action)).toBe(true);
    }
  });

  it.each(["FINANCE", "QC"])("preserves %s full access outside Attendance correction", (role) => {
    for (const resource of permissionResources.filter((item) => item !== "TEAM_PORTAL" && item !== "ATTENDANCE" && item !== "LEAVE_MANAGEMENT")) {
      for (const action of permissionActions) expect(canAccessResource([role], resource, action)).toBe(true);
    }
  });

  it.each(["ADMIN", "OPERATIONAL"])("blocks %s from restricted Finance & HR resources", (role) => {
    for (const resource of ["PROFIT_LOSS", "SALARY_SETTING", "SALARY_CLOSING", "SALARY_RECAP"] as const) {
      expect(canAccessResource([role], resource, "READ")).toBe(false);
      expect(canAccessResource([role], resource, "MANAGE")).toBe(false);
    }
  });

  it("keeps VIEWER read-only without export", () => {
    expect(canAccessResource(["VIEWER"], "INVOICE", "READ")).toBe(true);
    for (const action of permissionActions.filter((item) => item !== "READ")) {
      expect(canAccessResource(["VIEWER"], "INVOICE", action)).toBe(false);
    }
    expect(canAccessResource(["VIEWER"], "SETTINGS_PROFILE", "READ")).toBe(false);
    expect(canAccessResource(["VIEWER"], "USER_PROFILE", "UPDATE")).toBe(true);
  });

  it("isolates TEAM to its own read-only portal", () => {
    expect(canAccessResource(["TEAM"], "TEAM_PORTAL", "READ")).toBe(true);
    expect(canAccessResource(["TEAM"], "DASHBOARD", "READ")).toBe(false);
    expect(canAccessResource(["TEAM"], "SETTINGS_USERS", "READ")).toBe(false);
    expect(canAccessResource(["TEAM"], "TEAM_PORTAL", "UPDATE")).toBe(false);
  });

  it("keeps Attendance readable for full-access roles but correction restricted", () => {
    for (const role of ["OWNER", "ADMIN", "HR"]) {
      expect(canAccessResource([role], "ATTENDANCE", "READ")).toBe(true);
      expect(canAccessResource([role], "ATTENDANCE", "UPDATE")).toBe(true);
    }
    for (const role of ["FINANCE", "QC"]) {
      expect(canAccessResource([role], "ATTENDANCE", "READ")).toBe(true);
      expect(canAccessResource([role], "ATTENDANCE", "UPDATE")).toBe(false);
    }
    for (const role of ["VIEWER", "OPERATIONAL", "TEAM"]) {
      expect(canAccessResource([role], "ATTENDANCE", "UPDATE")).toBe(false);
    }
  });

  it("keeps Leave readable for Finance/QC but approval restricted", () => {
    for (const role of ["OWNER", "ADMIN", "HR"]) {
      expect(canAccessResource([role], "LEAVE_MANAGEMENT", "READ")).toBe(true);
      expect(canAccessResource([role], "LEAVE_MANAGEMENT", "APPROVE")).toBe(true);
    }
    for (const role of ["FINANCE", "QC"]) {
      expect(canAccessResource([role], "LEAVE_MANAGEMENT", "READ")).toBe(true);
      expect(canAccessResource([role], "LEAVE_MANAGEMENT", "APPROVE")).toBe(false);
    }
    for (const role of ["VIEWER", "OPERATIONAL", "TEAM"]) {
      expect(canAccessResource([role], "LEAVE_MANAGEMENT", "APPROVE")).toBe(false);
    }
  });
});
