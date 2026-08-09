import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assertTeamDataIsolation } from "@/modules/team/team-response";

describe("Team delivery summary API endpoint contract & security", () => {
  it("conforms to the explicit Team data isolation contract without exposing salary data", () => {
    const payload = {
      success: true,
      data: {
        businessDate: "2026-08-09",
        deliveryToday: 87,
        totalTtd: 83,
        pending: 4,
        achievement: 95.4,
      },
    };
    expect(() => assertTeamDataIsolation(payload)).not.toThrow();
  });

  it("strictly scopes employee identity to the authenticated session context and ignores client query params", async () => {
    const source = await readFile(
      `${process.cwd()}/src/app/api/team/delivery-summary/route.ts`,
      "utf8",
    );
    expect(source).toContain("resolveTeamContext(session)");
    expect(source).toContain("resolveTeamAcceptedCourierNames(context)");
    expect(source).toContain("teamJson");
    expect(source).not.toMatch(/searchParams|request\.json/);
  });
});
