import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hashSessionToken, isTeamSession, resolveTeamContext, TeamContextError, type SessionContext } from "./session";

describe("hashSessionToken", () => {
  it("returns a deterministic SHA-256 hash without retaining the token", () => {
    const token = "secret-session-token";
    const hash = hashSessionToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(token);
    expect(hash).toBe(hashSessionToken(token));
  });
});

describe("TEAM access boundary", () => {
  it("identifies TEAM without treating admin roles as Team", () => {
    expect(isTeamSession({ roles: ["TEAM"] })).toBe(true);
    expect(isTeamSession({ roles: ["OWNER"] })).toBe(false);
    expect(isTeamSession({ roles: ["ADMIN"] })).toBe(false);
  });

  it("derives the employee identity only from the active scoped membership", async () => {
    const session: SessionContext = {
      sessionId: "session-1", tenantId: "tenant-1", tenantName: "Tenant",
      userId: "user-1", userName: "Team", email: "team@example.test",
      outletId: "outlet-1", outletCode: "SUM001A", roles: ["TEAM"],
    };
    const findFirst = async (args: { where: Record<string, unknown> }) => {
      expect(args.where).toMatchObject({
        userId: "user-1", tenantId: "tenant-1", outletId: "outlet-1", status: "ACTIVE",
        salaryEmployee: { tenantId: "tenant-1", outletId: "outlet-1", status: "ACTIVE" },
      });
      return {
        id: "membership-1", tenantId: "tenant-1", outletId: "outlet-1",
        salaryEmployeeId: "employee-1", salaryEmployee: { name: "Kurir Satu", status: "ACTIVE" },
      };
    };
    await expect(resolveTeamContext(session, { teamMembership: { findFirst } } as never)).resolves.toMatchObject({
      membershipId: "membership-1", salaryEmployeeId: "employee-1", employeeName: "Kurir Satu", tenantName: "Tenant",
    });
  });

  it("rejects missing, inactive, cross-scope, and non-TEAM identities", async () => {
    const base = {
      sessionId: "session-1", tenantId: "tenant-1", tenantName: "Tenant",
      userId: "user-1", userName: "User", email: "user@example.test",
      outletId: "outlet-1", outletCode: "SUM001A", roles: ["TEAM"],
    } satisfies SessionContext;
    const noMembership = { teamMembership: { findFirst: async () => null } } as never;
    await expect(resolveTeamContext(base, noMembership)).rejects.toBeInstanceOf(TeamContextError);
    await expect(resolveTeamContext({ ...base, roles: ["ADMIN"] }, noMembership)).rejects.toBeInstanceOf(TeamContextError);
    await expect(resolveTeamContext({ ...base, outletId: null, outletCode: null }, noMembership)).rejects.toBeInstanceOf(TeamContextError);
  });

  it("keeps TEAM out of admin sessions and redirects dashboard access centrally", () => {
    const session = readFileSync(new URL("./session.ts", import.meta.url), "utf8");
    const layout = readFileSync(new URL("../../app/(dashboard)/dashboard/layout.tsx", import.meta.url), "utf8");
    const teamPage = readFileSync(new URL("../../app/team/page.tsx", import.meta.url), "utf8");
    expect(session).toContain("session && !isTeamSession(session) ? session : null");
    expect(session).toContain('if (isTeamSession(session)) redirect("/team")');
    expect(layout).toContain("await requireSession()");
    expect(teamPage).toContain("Aplikasi Team sedang dipersiapkan.");
    expect(teamPage).toContain("team.tenantName");
    expect(teamPage).toContain("<UserAvatar");
    expect(teamPage).toContain('href="/team/attendance"');
  });
});
