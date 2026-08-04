import { access, readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./empty-state";
import { NextgenBrand } from "./nextgen-brand";
import { UserAvatar } from "./user-avatar";

const root = new URL("../../../", import.meta.url);
const asset = (path: string) => new URL(path, root);

const svgAssets = [
  "public/brand/nextgen-logo-light.svg",
  "public/brand/nextgen-logo-dark.svg",
  "public/brand/nextgen-mark.svg",
  "public/brand/nextgen-wordmark.svg",
  "src/app/icon.svg",
  "public/illustrations/integration-empty.svg",
  "public/illustrations/empty-search.svg",
  "public/illustrations/empty-monitoring.svg",
  "public/illustrations/sidebar-logistics.svg",
  "public/illustrations/empty-data.svg",
  "public/illustrations/maintenance.svg",
  "public/illustrations/empty-payment.svg",
  "public/illustrations/empty-sync.svg",
  "public/backgrounds/dashboard-pattern.svg",
  "public/avatars/default-user.svg",
] as const;

const pngAssets = [
  ["public/brand/favicon.png", 64],
  ["public/brand/app-icon-192.png", 192],
  ["public/brand/app-icon-512.png", 512],
] as const;

describe("NEXTGEN UI asset and theme foundation", () => {
  it("keeps every declared asset path available", async () => {
    for (const path of [...svgAssets, ...pngAssets.map(([name]) => name)]) {
      await expect(access(asset(path))).resolves.toBeUndefined();
    }
  });

  it("keeps SVG assets local, passive, and safe to render", async () => {
    for (const path of svgAssets) {
      const source = await readFile(asset(path), "utf8");
      expect(source).toMatch(/^<svg\b/);
      expect(source).not.toMatch(/<script\b|<foreignObject\b/i);
      expect(source).not.toMatch(/\son[a-z]+\s*=/i);
      expect(source).not.toMatch(/javascript:|data:text\/html|@font-face/i);
      expect(source).not.toMatch(/<(?:image|use)\b/i);
      expect(source).not.toMatch(/(?:href|xlink:href)=["'](?:https?:|\/\/|data:)/i);
      expect(source).not.toMatch(/url\(["']?https?:/i);
    }
  });

  it("keeps favicon and app icons as correctly-sized PNG files", async () => {
    for (const [path, size] of pngAssets) {
      const source = await readFile(asset(path));
      expect(source.subarray(1, 4).toString("ascii")).toBe("PNG");
      expect(source.readUInt32BE(16)).toBe(size);
      expect(source.readUInt32BE(20)).toBe(size);
    }
  });

  it("publishes the complete semantic theme without replacing existing aliases", async () => {
    const css = await readFile(asset("src/app/globals.css"), "utf8");
    for (const token of [
      "primary", "primary-hover", "primary-soft", "navy", "sidebar",
      "sidebar-hover", "sidebar-active", "background", "surface", "card",
      "border", "text-primary", "text-secondary", "text-muted", "success",
      "success-soft", "warning", "warning-soft", "danger", "danger-soft",
      "purple", "purple-soft",
    ]) expect(css).toContain(`--nextgen-${token}:`);
    expect(css).toContain("--nextgen-background: var(--background)");
    expect(css).toContain(".nextgen-dashboard-pattern::before");
  });

  it("maps brand, avatar, empty states, and metadata to local assets", async () => {
    const brand = await readFile(asset("src/components/ui/nextgen-brand.tsx"), "utf8");
    const avatar = await readFile(asset("src/components/ui/user-avatar.tsx"), "utf8");
    const empty = await readFile(asset("src/components/ui/empty-state.tsx"), "utf8");
    const layout = await readFile(asset("src/app/layout.tsx"), "utf8");
    for (const variant of ["light", "dark", "mark", "wordmark"]) {
      expect(brand).toContain(`${variant}: { src:`);
    }
    expect(avatar).toContain('src || "/avatars/default-user.svg"');
    for (const path of [
      "empty-data.svg", "empty-search.svg", "empty-monitoring.svg",
      "empty-payment.svg", "empty-sync.svg", "integration-empty.svg",
      "maintenance.svg",
    ]) expect(empty).toContain(path);
    expect(layout).not.toContain('url: "/brand/favicon.png"');
    expect(await readFile(asset("src/app/icon.svg"), "utf8"))
      .toContain('fill="#050505"');
    expect(layout).toContain('url: "/brand/app-icon-192.png"');
    expect(layout).not.toContain("shortcut:");
  });

  it("renders light/dark brands, empty-state assets, and the avatar fallback", () => {
    const markup = renderToStaticMarkup(createElement("div", null,
      createElement(NextgenBrand, { variant: "light" }),
      createElement(NextgenBrand, { variant: "dark" }),
      createElement(EmptyState, { kind: "payment", label: "Belum ada pembayaran" }),
      createElement(UserAvatar, { name: "Operator" }),
    ));
    expect(markup).toContain("nextgen-logo-light.svg");
    expect(markup).toContain("nextgen-logo-dark.svg");
    expect(markup).toContain("empty-payment.svg");
    expect(markup).toContain("default-user.svg");
    expect(markup).toContain('aria-label="Belum ada pembayaran"');
  });

  it("keeps dashboard structure and sidebar accordion contracts intact", async () => {
    const dashboard = await readFile(
      asset("src/components/dashboard/dashboard-overview-client.tsx"),
      "utf8",
    );
    const sidebar = await readFile(asset("src/components/layout/sidebar.tsx"), "utf8");
    expect(dashboard).toContain('title="Monitoring Performance"');
    expect(dashboard).toContain('title="Payment Settlement"');
    expect(sidebar).toContain("resolveSidebarOpenGroup(pathname, activeGroup, accordionState)");
    expect(sidebar).toContain('toggleGroup("settings")');
    expect(sidebar).toContain('<NextgenBrand variant="mark" className="size-10 shrink-0"');
  });
});
