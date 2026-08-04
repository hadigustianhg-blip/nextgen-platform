import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assertTeamDataIsolation } from "./team-response";

describe("Team profile allowlist", () => {
  it("accepts only identity fields used by the mobile portal", () => {
    const response = { success: true, data: { name: "Dedi", division: "Driver", outletCode: "OUT001", username: "dedi@example.test", accountStatus: "Aktif", avatarUrl: "/avatars/default-user.svg" } };
    expect(() => assertTeamDataIsolation(response)).not.toThrow();
    expect(Object.keys(response.data).sort()).toEqual(["accountStatus", "avatarUrl", "division", "name", "outletCode", "username"]);
  });

  it("scopes profile to the authenticated membership and does not accept identity IDs from the client", async () => {
    const source = await readFile(`${process.cwd()}/src/app/api/team/profile/route.ts`, "utf8");
    expect(source).toContain("id: context.membershipId");
    expect(source).toContain("userId: context.userId");
    expect(source).toContain("tenantId: context.tenantId");
    expect(source).toContain("outletId: context.outletId");
    expect(source).not.toMatch(/searchParams|request\.json/);
  });
});
