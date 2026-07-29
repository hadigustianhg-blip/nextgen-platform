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
      "Pickup Omset",
      "Total Berat Pickup",
      "Delivery Monitoring",
      "Pickup Monitoring",
    ]) {
      expect(source).toContain(label);
    }
    expect(source).toContain("xl:grid-cols-2");
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
});
