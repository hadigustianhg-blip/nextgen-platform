import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assertTeamDataIsolation } from "@/modules/team/team-response";

describe("Team monthly delivery API route contract & security", () => {
  it("conforms to the explicit Team data isolation contract without exposing salary data", () => {
    const payload = {
      success: true,
      data: {
        month: "2026-08",
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        employeeName: "YUDI MULYADI",
        summary: {
          totalDelivery: 450,
          totalTtd: 435,
          pending: 15,
          achievement: 96.67,
        },
        dailyBreakdown: [
          {
            date: "2026-08-09",
            totalDelivery: 87,
            totalTtd: 83,
            pending: 4,
            achievement: 95.4,
          },
        ],
      },
    };
    expect(() => assertTeamDataIsolation(payload)).not.toThrow();
  });

  it("strictly scopes employee identity to the authenticated session context and forbids client employee query params", async () => {
    const source = await readFile(
      `${process.cwd()}/src/app/api/team/delivery/monthly/route.ts`,
      "utf8",
    );
    expect(source).toContain("resolveTeamContext(session)");
    expect(source).toContain("resolveTeamAcceptedCourierNames(context)");
    expect(source).toContain("teamJson");
    expect(source).not.toMatch(/employee=|\.get\("employee"\)|\.get\("employeeId"\)|\.get\("name"\)/);
  });
});
