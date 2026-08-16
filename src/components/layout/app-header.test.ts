import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  filterNavigationItems,
  getSearchableNavigation,
  moveNavigationIndex,
} from "./app-navigation";

describe("premium global app header", () => {
  it("indexes existing sidebar routes and filters menu labels", () => {
    const items = getSearchableNavigation(["OWNER"]);
    expect(filterNavigationItems(items, "monitoring").map((item) => item.label))
      .toEqual(["Monitoring Daily", "Monitoring Monthly"]);
    expect(filterNavigationItems(items, "pickup settlement")[0]).toMatchObject({
      href: "/dashboard/settlement/pickup",
    });
    expect(filterNavigationItems(items, "salary closing")[0]).toMatchObject({
      href: "/dashboard/finance/salary-closing",
    });
  });

  it("uses the canonical settings access result to hide protected menu routes", () => {
    expect(getSearchableNavigation(["VIEWER"]).some((item) => item.label === "Audit Log")).toBe(false);
    expect(getSearchableNavigation(["OWNER"]).find((item) => item.label === "Audit Log"))
      .toMatchObject({ href: "/dashboard/settings/audit-logs" });
    expect(getSearchableNavigation(["OPERATIONAL"]).some((item) => item.label === "Target & KPI")).toBe(false);
    expect(getSearchableNavigation(["QC"]).find((item) => item.label === "Target & KPI"))
      .toMatchObject({ href: "/dashboard/settings/target-kpi" });
    expect(getSearchableNavigation(["ADMIN"]).some((item) => item.label === "Profit Loss")).toBe(false);
    expect(getSearchableNavigation(["FINANCE"]).some((item) => item.label === "Profit Loss")).toBe(true);
  });

  it("supports wrapping Arrow Up and Arrow Down navigation", () => {
    expect(moveNavigationIndex(-1, 1, 3)).toBe(0);
    expect(moveNavigationIndex(-1, -1, 3)).toBe(2);
    expect(moveNavigationIndex(2, 1, 3)).toBe(0);
    expect(moveNavigationIndex(0, -1, 3)).toBe(2);
    expect(moveNavigationIndex(0, 1, 0)).toBe(-1);
  });

  it("renders an accessible search combobox and keyboard controls", async () => {
    const source = await readFile(new URL("./app-header.tsx", import.meta.url), "utf8");
    expect(source).toContain('role="combobox"');
    expect(source).toContain('role="listbox"');
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain('event.key === "ArrowDown"');
    expect(source).toContain('event.key === "ArrowUp"');
    expect(source).toContain('event.key === "Enter"');
    expect(source).toContain("router.push(href)");
  });

  it("keeps outlet identity read-only and creates no outlet write", async () => {
    const source = await readFile(new URL("./app-header.tsx", import.meta.url), "utf8");
    expect(source).toContain("Outlet Aktif");
    expect(source).toContain("Outlet aktif bersifat read-only");
    expect(source).not.toMatch(/fetch\([^)]*outlet[^)]*method:/i);
  });

  it("uses a professional empty notification state without a fake badge", async () => {
    const source = await readFile(new URL("./app-header.tsx", import.meta.url), "utf8");
    expect(source).toContain("Belum ada notifikasi.");
    expect(source).not.toContain("notificationCount");
    expect(source).not.toContain("notification-badge");
  });

  it("uses the existing avatar and logout flow", async () => {
    const source = await readFile(new URL("./app-header.tsx", import.meta.url), "utf8");
    expect(source).toContain("<UserAvatar");
    expect(source).toContain("src={session.avatarUrl}");
    expect(source).toContain('action="/api/auth/logout"');
    expect(source).toContain('method="post"');
    expect(source).toContain("session.userName");
    expect(source).toContain("displayRole(session.roles)");
    expect(source).toContain('router.push("/dashboard/profile")');
    expect(source).not.toContain("Segera tersedia");
    expect(getSearchableNavigation(["VIEWER"]).find((item) => item.label === "Profil Saya"))
      .toMatchObject({ href: "/dashboard/profile" });
  });

  it("wires the header through AppShell without changing Sidebar", async () => {
    const shell = await readFile(new URL("./app-shell.tsx", import.meta.url), "utf8");
    expect(shell).toContain("<AppHeader session={session} />");
    expect(shell).toContain("<Sidebar roles={session.roles} />");
    expect(shell).toContain("bg-[var(--nextgen-background)]");
  });

  it("keeps the opaque app header sticky without removing it from document flow", async () => {
    const source = await readFile(new URL("./app-header.tsx", import.meta.url), "utf8");
    expect(source).toContain("sticky top-0 z-20");
    expect(source).toContain("bg-[var(--nextgen-card)]");
    expect(source).not.toContain("fixed top-0");
    expect(source).not.toContain("absolute inset-x-0");
  });

  it("anchors the outlet, notification, and profile group to the right", async () => {
    const source = await readFile(new URL("./app-header.tsx", import.meta.url), "utf8");
    expect(source).toContain("items-center justify-between");
    expect(source).toContain("ml-auto flex shrink-0 items-center gap-2 sm:gap-3 lg:gap-4");
    expect(source.indexOf("Outlet Aktif")).toBeLessThan(source.indexOf('aria-label="Notifikasi"'));
    expect(source.indexOf('aria-label="Notifikasi"')).toBeLessThan(source.indexOf('aria-label="Buka menu profil"'));
  });

  it("uses one cache-busted browser favicon while retaining the separate Apple icon", async () => {
    const layout = await readFile(new URL("../../app/layout.tsx", import.meta.url), "utf8");
    const icon = await readFile(new URL("../../../public/icon-v2.svg", import.meta.url), "utf8");
    expect(layout).not.toContain('url: "/brand/favicon.png"');
    expect(layout).not.toContain("shortcut:");
    expect(layout.match(/icon: \[\{ url: "\/icon-v2\.svg"/g)).toHaveLength(1);
    expect(layout).toContain('apple: [{ url: "/brand/app-icon-192.png"');
    expect(icon).toContain('fill="#050505"');
    expect(icon).toContain("nextgen-icon-primary");
    expect(icon).toContain("M86 390V122");
  });

  it("keeps the responsive header compact without fixed content widths", async () => {
    const source = await readFile(new URL("./app-header.tsx", import.meta.url), "utf8");
    expect(source).toContain("min-h-[72px]");
    expect(source).toContain("min-w-0 flex-1");
    expect(source).toContain("md:max-w-xl");
    expect(source).toContain("lg:block");
    expect(source).not.toContain("w-[600px]");
  });
});
