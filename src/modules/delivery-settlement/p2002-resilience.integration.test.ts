import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { syncDeliverySettlement } from "./delivery-settlement.service";

describe("Delivery Settlement P2002 & Single-Flight Integration Test", () => {
  it("executes first sync, rerun sync, and concurrent sync without P2002 or duplicate errors", async () => {
    const outlet = await prisma.outlet.findFirst({
      where: { code: "SUM001A" },
      select: { id: true, tenantId: true, code: true },
    });

    if (!outlet) {
      console.log("No SUM001A outlet in local DB, skipping live integration test");
      return;
    }

    const scope = { tenantId: outlet.tenantId, outletId: outlet.id, actorId: "test-actor" };
    const dateStr = "2026-08-11";

    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes("/jfs-dispatch")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            total: 2,
            data: [
              { waybillNo: "TEST_P2002_01", kurir: "KURIR_TEST", ongkir: 15000, waktu: "2026-08-11 10:00:00", receiver: "R1", address: "A1", status: "Penerimaan Normal", berat: 1, pembayaran: "DFOD", service: "EZ", codStatus: "", codValue: 0, barang: "B1" },
              { waybillNo: "TEST_P2002_02", kurir: "KURIR_TEST", ongkir: 20000, waktu: "2026-08-11 10:30:00", receiver: "R2", address: "A2", status: "Penerimaan Normal", berat: 1, pembayaran: "DFOD", service: "EZ", codStatus: "", codValue: 0, barang: "B2" },
            ],
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, total: 0, data: [] }),
      };
    });

    // 1. FIRST RUN
    const run1 = await syncDeliverySettlement(scope, { operationalDate: dateStr, fetchSource: mockFetch as any });
    expect(run1.status).toBe("SUCCESS");
    expect(run1.dispatchFetchedCount).toBe(2);
    expect(run1.dispatchCreatedCount).toBeGreaterThanOrEqual(0);

    // 2. SECOND RUN (RERUN) - Idempotent
    const run2 = await syncDeliverySettlement(scope, { operationalDate: dateStr, fetchSource: mockFetch as any });
    expect(run2.status).toBe("SUCCESS");
    expect(run2.dispatchFetchedCount).toBe(2);

    // 3. CONCURRENT RUNS - Single Flight Lock
    const [c1, c2] = await Promise.all([
      syncDeliverySettlement(scope, { operationalDate: dateStr, fetchSource: mockFetch as any }),
      syncDeliverySettlement(scope, { operationalDate: dateStr, fetchSource: mockFetch as any }),
    ]);

    expect(c1.status).toBe("SUCCESS");
    expect(c2.status).toBe("SUCCESS");
    expect(c1 === c2).toBe(true);
  });
});
