import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assertTeamDataIsolation } from "@/modules/team/team-response";

describe("Team operational API endpoint contract & security", () => {
  it("conforms to the explicit Team data isolation contract without exposing salary data", () => {
    const payload = {
      success: true,
      data: {
        businessDate: "2026-08-09",
        employeeName: "YUDI MULYADI",
        delivery: {
          summary: { deliveryToday: 87, totalTtd: 83, pending: 4, achievement: 95.4 },
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
        pickup: {
          summary: { pickupToday: 12, totalWeight: 45.5 },
          items: [
            {
              id: "pickup-1",
              waybillNo: "JP987654321",
              settlementType: "Tunai",
              weight: 3.2,
              fetchedAt: "2026-08-09T09:15:00.000Z",
            },
          ],
        },
        settlement: {
          hasRecord: true,
          codAmount: 1250000,
          dfodAmount: 350000,
          pickupAmount: 500000,
          totalObligation: 2100000,
          paidAmount: 1000000,
          remainingAmount: 1100000,
          status: "SEBAGIAN",
          lastPaymentAt: "2026-08-09T17:00:00.000Z",
          note: "Setoran operasional",
        },
      },
    };
    expect(() => assertTeamDataIsolation(payload)).not.toThrow();
  });

  it("strictly scopes identity to the authenticated session server context and forbids date or employee query params", async () => {
    const source = await readFile(
      `${process.cwd()}/src/app/api/team/operational/route.ts`,
      "utf8",
    );
    expect(source).toContain("resolveTeamContext(session)");
    expect(source).toContain("resolveTeamAcceptedCourierNames(context)");
    expect(source).toContain("resolveTeamAcceptedPickupNames(context)");
    expect(source).toContain("teamJson");
    expect(source).not.toMatch(/searchParams|request\.json/);
  });
});
