import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("HR Attendance Monitoring API endpoint contract & security", () => {
  it("strictly scopes query by session tenantId & outletId and checks ATTENDANCE READ permission", async () => {
    const source = await readFile(
      `${process.cwd()}/src/app/api/hr/attendance/monitoring/route.ts`,
      "utf8",
    );
    expect(source).toContain("canAccessResource(session.roles, \"ATTENDANCE\", \"READ\")");
    expect(source).toContain("tenantId: session.tenantId");
    expect(source).toContain("outletId: session.outletId");
    expect(source).not.toMatch(/prisma\.teamMembership\.findMany\(\s*\{\s*where:\s*\{(?![^}]*tenantId)/);
  });
});
