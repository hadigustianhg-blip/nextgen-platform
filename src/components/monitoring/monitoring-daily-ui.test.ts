import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Monitoring Daily UI contract", () => {
  it("keeps one split monitoring page with all requested metrics", async () => {
    const source = await readFile(
      new URL("./monitoring-daily-client.tsx", import.meta.url),
      "utf8",
    );
    for (const label of [
      "Achievement Delivery",
      "Total Delivery",
      "Total TTD",
      "Pending",
      "Berat Delivery",
      "Pickup Omset",
      "Total Berat Pickup",
      "Delivery Monitoring",
      "Pickup Monitoring",
    ]) {
      expect(source).toContain(label);
    }
    expect(source).toContain('<section className="space-y-6">');
    expect(source).not.toContain("xl:grid-cols-2");
    expect(source).toContain('"Total Pending",\n                    "Berat Delivery"');
  });

  it("uses the shared NEXTGEN card system and exact empty states", async () => {
    const source = await readFile(
      new URL("./monitoring-daily-client.tsx", import.meta.url),
      "utf8",
    );
    for (const component of [
      "PageHeader",
      "MetricCard",
      "FilterCard",
      "TableCard",
    ]) {
      expect(source).toContain(component);
    }
    expect(source).toContain(
      "Belum ada data Delivery untuk Business Date ini.",
    );
    expect(source).toContain("Belum ada data Pickup untuk Business Date ini.");
  });

  it("keeps refresh and scraper synchronization as separate actions", async () => {
    const source = await readFile(
      new URL("./monitoring-daily-client.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("Refresh");
    expect(source).toContain("Sinkronkan Data");
    expect(source).toContain("Menyinkronkan...");
    expect(source).toContain('fetch("/api/monitoring/daily/sync"');
    expect(source).toContain("setRefreshKey((value) => value + 1)");
    expect(source).toContain("unique waybill");
    expect(source).toContain("duplikat diabaikan");
    expect(source).not.toMatch(/totalPending\s*=|totalDelivery\s*-\s*totalTtd/);
  });

  it("protects the orchestration API and reuses both existing sync services", async () => {
    const source = await readFile(
      new URL("../../app/api/monitoring/daily/sync/route.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("canSyncDelivery(session)");
    expect(source).toContain("canSyncPickup(session)");
    expect(source).toContain("syncDeliverySettlement(context");
    expect(source).toContain("syncPickup(context");
    expect(source).toContain("resolveMonitoringOutlet");
  });

  it("exposes keyboard-accessible KPI and per-team detail drilldowns", async () => {
    const source = await readFile(new URL("./monitoring-daily-client.tsx", import.meta.url), "utf8");
    expect(source).toContain('role="button"');
    expect(source).toContain('event.key === "Enter" || event.key === " "');
    expect(source).toContain("/api/monitoring/daily/detail");
    expect(source).toContain("Rincian Achievement Delivery");
    expect(source).toContain("Rincian Total Delivery");
    expect(source).toContain("Rincian Pickup Omset");
    expect(source).toContain("Menampilkan {number(rows.length)} data");
    expect(source).toContain("Alamat Penerima");
    expect(source).toContain("Cari Waybill / Customer / Team / Alamat");
    expect(source).toContain('row.receiverAddress || "-"');
  });
});
