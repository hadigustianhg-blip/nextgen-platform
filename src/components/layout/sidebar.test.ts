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

  it("provides one semantic accordion state for every submenu", async () => {
    const source = await readFile(
      new URL("./sidebar.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('aria-controls="settlement-submenu"');
    expect(source).toContain('aria-controls="payment-submenu"');
    expect(source).toContain('aria-controls="monitoring-submenu"');
    expect(source).toContain('toggleGroup("monitoring")');
    expect(source).toContain('toggleGroup("settlement")');
    expect(source).toContain('toggleGroup("payment")');
    expect(source).toContain('const [openGroup, setOpenGroup]');
    expect(source).toContain('const monitoringVisible = visibleGroup === "monitoring"');
    expect(source).toContain('const settlementVisible = visibleGroup === "settlement"');
    expect(source).toContain('const paymentVisible = visibleGroup === "payment"');
    expect(source).not.toContain("setMonitoringOpen");
    expect(source).not.toContain("setSettlementOpen");
    expect(source).not.toContain("setPaymentOpen");
  });

  it("persists desktop and the single open group with namespaced keys", async () => {
    const source = await readFile(
      new URL("./sidebar.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('"nextgen.sidebar.collapsed"');
    expect(source).toContain('"nextgen.sidebar.open-group"');
    expect(source).toContain("const visibleGroup = activeGroup ?? openGroup");
    expect(source).toContain("current ?? validStoredGroup");
    expect(source).toContain("return activeGroup === group ? current : null");
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
    expect(source).toContain('const qualityControlVisible = visibleGroup === "quality-control"');
    expect(source).toContain(
      'href="/dashboard/quality-control/sla-cut-off"',
    );
    expect(source).toContain('label="SLA Cut Off"');
    expect(source).toContain(
      'active={pathname.startsWith("/dashboard/quality-control/sla-cut-off")}',
    );
  });

  it("exposes Problem Waybill Delivery under Quality Control", async () => {
    const source = await readFile(
      new URL("./sidebar.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain(
      'href="/dashboard/quality-control/problem-waybill-delivery"',
    );
    expect(source).toContain('label="Problem Waybill Delivery"');
    expect(source).toContain(
      'active={pathname.startsWith("/dashboard/quality-control/problem-waybill-delivery")}',
    );
  });

  it("orders Waybill Stuck Delivery between SLA and Problem Waybill", async () => {
    const source = await readFile(
      new URL("./sidebar.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain(
      'href="/dashboard/quality-control/waybill-stuck-delivery"',
    );
    expect(source.indexOf('label="SLA Cut Off"')).toBeLessThan(
      source.indexOf('label="Waybill Stuck Delivery"'),
    );
    expect(source.indexOf('label="Waybill Stuck Delivery"')).toBeLessThan(
      source.indexOf('label="Problem Waybill Delivery"'),
    );
  });

  it("exposes Penjadwalan Pickup under Quality Control", async () => {
    const source = await readFile(
      new URL("./sidebar.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain(
      'href="/dashboard/quality-control/pickup-scheduling"',
    );
    expect(source).toContain('label="Penjadwalan Pickup"');
    expect(source).toContain(
      'active={pathname.startsWith("/dashboard/quality-control/pickup-scheduling")}',
    );
  });

  it("exposes Rincian Operasional under persistent Finance & HR", async () => {
    const source = await readFile(new URL("./sidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain('const financeVisible = visibleGroup === "finance"');
    expect(source).toContain('aria-controls="finance-submenu"');
    expect(source).toContain('href="/dashboard/finance/rincian-operasional"');
    expect(source).toContain(
      'active={pathname.startsWith("/dashboard/finance/rincian-operasional")}',
    );
  });

  it("exposes Profit Loss on the compatible Cashflow JFS route", async () => {
    const source = await readFile(new URL("./sidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain('href="/dashboard/finance/cashflow-jfs"');
    expect(source).toContain('label="Profit Loss"');
    expect(source).toContain(
      'active={pathname.startsWith("/dashboard/finance/cashflow-jfs")}',
    );
  });

  it("exposes Create Invoice under persistent Finance & HR", async () => {
    const source = await readFile(new URL("./sidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain('href="/dashboard/finance/create-invoice"');
    expect(source).toContain('label="Create Invoice"');
    expect(source).toContain(
      'active={pathname.startsWith("/dashboard/finance/create-invoice")}',
    );
  });

  it("exposes Salary Setting, Closing, and Recap under Finance & HR", async () => {
    const source = await readFile(new URL("./sidebar.tsx", import.meta.url), "utf8");
    for (const [route, label] of [
      ["salary-setting", "Salary Setting"],
      ["salary-closing", "Salary Closing"],
      ["salary-recap", "Salary Recap"],
    ]) {
      expect(source).toContain(`href="/dashboard/finance/${route}"`);
      expect(source).toContain(`label="${label}"`);
      expect(source).toContain(
        `pathname.startsWith("/dashboard/finance/${route}")`,
      );
    }
  });
});
