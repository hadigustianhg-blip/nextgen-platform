import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  filterNavigationItems,
  getSearchableNavigation,
  moveNavigationIndex,
} from "./app-navigation";

describe("premium global app header", () => {
  it("indexes existing sidebar routes and filters menu labels", () => {
    const items = getSearchableNavigation(false);
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
    expect(getSearchableNavigation(false).some((item) => item.label === "Audit Log")).toBe(false);
    expect(getSearchableNavigation(true).find((item) => item.label === "Audit Log"))
      .toMatchObject({ href: "/dashboard/settings/audit-logs" });
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
    expect(source).toContain('action="/api/auth/logout"');
    expect(source).toContain('method="post"');
    expect(source).toContain("session.userName");
    expect(source).toContain("displayRole(session.roles)");
  });

  it("wires the header through AppShell without changing Sidebar", async () => {
    const shell = await readFile(new URL("./app-shell.tsx", import.meta.url), "utf8");
    expect(shell).toContain("<AppHeader session={session} />");
    expect(shell).toContain("<Sidebar outletCode={session.outletCode} />");
    expect(shell).toContain("bg-[var(--nextgen-background)]");
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
