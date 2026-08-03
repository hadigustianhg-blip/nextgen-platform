import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hashSessionToken, isTeamSession } from "./session";

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

  it("keeps TEAM out of admin sessions and redirects dashboard access centrally", () => {
    const session = readFileSync(new URL("./session.ts", import.meta.url), "utf8");
    const layout = readFileSync(new URL("../../app/(dashboard)/dashboard/layout.tsx", import.meta.url), "utf8");
    const teamPage = readFileSync(new URL("../../app/team/page.tsx", import.meta.url), "utf8");
    expect(session).toContain("session && !isTeamSession(session) ? session : null");
    expect(session).toContain('if (isTeamSession(session)) redirect("/team")');
    expect(layout).toContain("await requireSession()");
    expect(teamPage).toContain("Aplikasi Team sedang dipersiapkan.");
    expect(teamPage).not.toContain("attendance");
  });
});
