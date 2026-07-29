import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("pickup navigation", () => {
  it("hides RAW Pickup and exposes Pickup Settlement under Settlement Center", async () => {
    const source = await readFile(
      new URL("./sidebar.tsx", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain('label: "RAW Pickup"');
    expect(source).toContain("Settlement Center");
    expect(source).toContain('href="/dashboard/settlement/pickup"');
    expect(source).toContain("Pickup Settlement");
    expect(source).toContain('href="/dashboard/settlement/operational"');
    expect(source.indexOf("Delivery Settlement")).toBeLessThan(
      source.indexOf("Operational Settlement"),
    );
  });

  it("provides independent semantic submenu toggles", async () => {
    const source = await readFile(
      new URL("./sidebar.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('aria-controls="settlement-submenu"');
    expect(source).toContain('aria-controls="payment-submenu"');
    expect(source).toContain('aria-controls="monitoring-submenu"');
    expect(source).toContain("setMonitoringOpen((value) => !value)");
    expect(source).toContain("setSettlementOpen((value) => !value)");
    expect(source).toContain("setPaymentOpen((value) => !value)");
    expect(source).toContain(
      "const settlementVisible = settlementActive || settlementOpen",
    );
    expect(source).toContain(
      "const paymentVisible = paymentActive || paymentOpen",
    );
    expect(source).toContain(
      "const monitoringVisible = monitoringActive || monitoringOpen",
    );
  });

  it("persists desktop and submenu preferences with namespaced keys", async () => {
    const source = await readFile(
      new URL("./sidebar.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('"nextgen.sidebar.collapsed"');
    expect(source).toContain('"nextgen.sidebar.monitoring.open"');
    expect(source).toContain('"nextgen.sidebar.settlement.open"');
    expect(source).toContain('"nextgen.sidebar.payment.open"');
    expect(source).toContain("storageReady");
  });

  it("keeps mobile drawer behavior and accessible controls", async () => {
    const source = await readFile(
      new URL("./sidebar.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('aria-label="Buka navigasi"');
    expect(source).toContain('aria-label="Tutup navigasi"');
    expect(source).toContain("onClick={closeMobile}");
    expect(source).toContain("focus-visible:ring-2");
    expect(source).toContain("title={collapsed ? label : undefined}");
  });

  it("exposes Monitoring Daily with an active child route", async () => {
    const source = await readFile(
      new URL("./sidebar.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('href="/dashboard/monitoring/daily"');
    expect(source).toContain('label="Monitoring Daily"');
    expect(source).toContain(
      'active={pathname.startsWith("/dashboard/monitoring/daily")}',
    );
    expect(source).toContain('href="/dashboard/monitoring/monthly"');
    expect(source).toContain('label="Monitoring Monthly"');
    expect(source).toContain(
      'active={pathname.startsWith("/dashboard/monitoring/monthly")}',
    );
  });

  it("exposes SLA Cut Off with persistent active Quality Control parent", async () => {
    const source = await readFile(
      new URL("./sidebar.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('aria-controls="quality-control-submenu"');
    expect(source).toContain('"nextgen.sidebar.quality-control.open"');
    expect(source).toContain(
      'const qualityControlVisible = qualityControlActive || qualityControlOpen',
    );
    expect(source).toContain(
      'href="/dashboard/quality-control/sla-cut-off"',
    );
    expect(source).toContain('label="SLA Cut Off"');
    expect(source).toContain(
      'active={pathname.startsWith("/dashboard/quality-control/sla-cut-off")}',
    );
  });
});
