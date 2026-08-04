import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  resolveSidebarOpenGroup,
  toggleSidebarGroup,
  type SidebarAccordionState,
  type SidebarGroup,
} from "./sidebar";

describe("pickup navigation", () => {
  it("keeps outlet identity only in the global header", async () => {
    const source = await readFile(
      new URL("./sidebar.tsx", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("Outlet aktif");
    expect(source).not.toContain("Semua Outlet");
    expect(source).toContain('<nav\n          className="mt-5');
  });

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
    expect(source).toContain("useState<SidebarAccordionState>");
    expect(source).toContain('const monitoringVisible = openGroupId === "monitoring"');
    expect(source).toContain('const settlementVisible = openGroupId === "settlement"');
    expect(source).toContain('const paymentVisible = openGroupId === "payment"');
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
    expect(source).toContain("resolveSidebarOpenGroup(pathname, activeGroup, accordionState)");
    expect(source).toContain("current.openGroupId === null");
    expect(source).toContain("state.pathname === pathname ? state.openGroupId : activeGroup");
    expect(source).toContain("storageReady");
  });

  it("lets user clicks override the current route group until navigation changes", () => {
    const monitoringPath = "/dashboard/monitoring/daily";
    let state: SidebarAccordionState = {
      pathname: monitoringPath,
      openGroupId: "monitoring",
    };
    let openGroup: SidebarGroup | null = resolveSidebarOpenGroup(
      monitoringPath,
      "monitoring",
      state,
    );

    state = toggleSidebarGroup(monitoringPath, openGroup, "settings");
    openGroup = resolveSidebarOpenGroup(monitoringPath, "monitoring", state);
    expect(openGroup).toBe("settings");

    const settingsPath = "/dashboard/settings/integrations";
    expect(resolveSidebarOpenGroup(settingsPath, "settings", state)).toBe("settings");
    state = toggleSidebarGroup(settingsPath, "settings", "finance");
    expect(resolveSidebarOpenGroup(settingsPath, "settings", state)).toBe("finance");

    const financePath = "/dashboard/finance/salary-setting";
    expect(resolveSidebarOpenGroup(financePath, "finance", state)).toBe("finance");
    state = toggleSidebarGroup(financePath, "finance", "settlement");
    expect(resolveSidebarOpenGroup(financePath, "finance", state)).toBe("settlement");
  });

  it("opens the active parent immediately after navigation or reload", () => {
    const staleState: SidebarAccordionState = {
      pathname: "/dashboard/finance/salary-setting",
      openGroupId: "settlement",
    };
    expect(resolveSidebarOpenGroup(
      "/dashboard/settlement/delivery",
      "settlement",
      staleState,
    )).toBe("settlement");

    const reloadState: SidebarAccordionState = {
      pathname: "/dashboard/payment/pickup",
      openGroupId: "payment",
    };
    expect(resolveSidebarOpenGroup(
      "/dashboard/payment/pickup",
      "payment",
      reloadState,
    )).toBe("payment");
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
    expect(source).toContain('const qualityControlVisible = openGroupId === "quality-control"');
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
    expect(source).toContain('const financeVisible = openGroupId === "finance"');
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

  it("exposes only the new Target & KPI item under Settings", async () => {
    const source = await readFile(new URL("./sidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain('["Target & KPI", "/dashboard/settings/target-kpi"]');
    expect(source).toContain('const settingsActive = pathname.startsWith("/dashboard/settings/")');
  });
});
