import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assertTeamDataIsolation } from "@/modules/team/team-response";

describe("Team cash advance API endpoint contract & security", () => {
  it("conforms strictly to Team data isolation contract without exposing salary profile data", () => {
    const payload = {
      success: true,
      data: {
        employeeName: "YUDI MULYADI",
        summary: {
          activeCount: 1,
          totalAmount: 500000,
          totalPaid: 200000,
          totalRemaining: 300000,
        },
        items: [
          {
            id: "expense-1",
            date: "2026-08-05",
            category: "Kasbon Operasional",
            description: "Bensin operasional",
            amount: 500000,
            paidAmount: 200000,
            remainingAmount: 300000,
            status: "SEBAGIAN",
          },
        ],
      },
    };
    expect(() => assertTeamDataIsolation(payload)).not.toThrow();
  });

  it("strictly scopes identity to the authenticated session server context and forbids employee query params", async () => {
    const source = await readFile(
      `${process.cwd()}/src/app/api/team/cash-advance/route.ts`,
      "utf8",
    );
    expect(source).toContain("resolveTeamContext(session)");
    expect(source).toContain("resolveTeamAcceptedNames(context)");
    expect(source).toContain("teamJson");
    expect(source).not.toMatch(/searchParams|request\.json/);
  });
});
