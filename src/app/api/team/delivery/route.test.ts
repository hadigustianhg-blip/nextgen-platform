import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assertTeamDataIsolation } from "@/modules/team/team-response";

describe("Team daily delivery API route contract & security", () => {
  it("conforms to the explicit Team data isolation contract without exposing salary data", () => {
    const payload = {
      success: true,
      data: {
        businessDate: "2026-08-09",
        employeeName: "YUDI MULYADI",
        summary: {
          deliveryToday: 87,
          totalTtd: 83,
          pending: 4,
          achievement: 95.4,
        },
        shipments: [
          {
            id: "dispatch-1",
            waybillNo: "JP123456789",
            deliveryStatus: "PENERIMAAN NORMAL",
            receiverName: "Budi",
            dispatchAt: "2026-08-09T08:30:00.000Z",
            chargeWeight: 1.5,
          },
        ],
      },
    };
    expect(() => assertTeamDataIsolation(payload)).not.toThrow();
  });

  it("strictly scopes employee identity to the authenticated session context and forbids client employee query params", async () => {
    const source = await readFile(
      `${process.cwd()}/src/app/api/team/delivery/route.ts`,
      "utf8",
    );
    expect(source).toContain("resolveTeamContext(session)");
    expect(source).toContain("resolveTeamAcceptedCourierNames(context)");
    expect(source).toContain("teamJson");
    expect(source).not.toMatch(/employee=|\.get\("employee"\)|\.get\("employeeId"\)|\.get\("name"\)/);
  });
});
