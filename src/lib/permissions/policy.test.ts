import { describe, expect, it } from "vitest";
import { canAccessResource, permissionActions, permissionResources } from "./policy";

describe("final role permission policy", () => {
  it.each(["OWNER", "SUPER_ADMIN", "FINANCE", "HR", "QC"])("grants %s full admin access", (role) => {
    for (const resource of permissionResources.filter((item) => item !== "TEAM_PORTAL")) {
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
  });

  it("isolates TEAM to its own read-only portal", () => {
    expect(canAccessResource(["TEAM"], "TEAM_PORTAL", "READ")).toBe(true);
    expect(canAccessResource(["TEAM"], "DASHBOARD", "READ")).toBe(false);
    expect(canAccessResource(["TEAM"], "SETTINGS_USERS", "READ")).toBe(false);
    expect(canAccessResource(["TEAM"], "TEAM_PORTAL", "UPDATE")).toBe(false);
  });
});
