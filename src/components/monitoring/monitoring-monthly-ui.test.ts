import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Monitoring Monthly contracts", () => {
  it("renders the full-width monthly UI and period shortcuts", async () => {
    const source = await readFile(
      new URL("./monitoring-monthly-client.tsx", import.meta.url),
      "utf8",
    );
    for (const text of [
      "Monitoring Monthly",
      "Delivery Monitoring Monthly",
      "Pickup Monitoring Monthly",
      "Bulan Ini",
      "1–15",
      "16–Akhir Bulan",
      "Belum ada data Delivery pada periode ini.",
      "Belum ada data Pickup pada periode ini.",
    ]) {
      expect(source).toContain(text);
    }
    expect(source).toContain('<section className="space-y-6">');
    expect(source).not.toContain("xl:grid-cols-2");
  });

  it("uses scoped aggregate range queries without loading raw rows", async () => {
    const source = await readFile(
      new URL(
        "../../modules/monitoring/monitoring-monthly.service.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source).toContain("tenantId: input.tenantId");
    expect(source).toContain("outletId: input.outletId");
    expect(source).toContain("gte: dateValue(input.startDate)");
    expect(source).toContain("lte: dateValue(input.endDate)");
    expect(source).toContain("prisma.rawDispatch.groupBy");
    expect(source).toContain("prisma.rawPickup.groupBy");
    expect(source).not.toContain("findMany");
  });

  it("protects the API and keeps Refresh database-only", async () => {
    const api = await readFile(
      new URL("../../app/api/monitoring/monthly/route.ts", import.meta.url),
      "utf8",
    );
    const client = await readFile(
      new URL("./monitoring-monthly-client.tsx", import.meta.url),
      "utf8",
    );
    expect(api).toContain("canReadMonitoringDaily(session)");
    expect(api).toContain("resolveMonitoringOutlet");
    expect(client).toContain("fetch(`/api/monitoring/monthly?${query}`");
    expect(client).not.toContain("/api/monitoring/daily/sync");
    expect(client).not.toContain("Sinkronkan Data");
    expect(client).not.toContain("Menyinkronkan");
  });
});
