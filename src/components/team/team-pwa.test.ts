import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import manifest from "@/app/manifest";
import { isIosSafari, isStandaloneDisplay } from "@/components/pwa/team-pwa-install";
import { isTeamNavActive } from "./team-shell";

const root = process.cwd();
const read = (file: string) => readFile(`${root}/${file}`, "utf8");

describe("NEXTGEN Team PWA shell", () => {
  it("uses the canonical mobile navigation and exact active state", async () => {
    const source = await read("src/components/team/team-shell.tsx");
    for (const route of ["/team", "/team/attendance", "/team/leave", "/team/delivery", "/team/profile"]) expect(source).toContain(route);
    expect(isTeamNavActive("/team", "/team")).toBe(true);
    expect(isTeamNavActive("/team/attendance", "/team/attendance")).toBe(true);
    expect(isTeamNavActive("/team/profile", "/team/attendance")).toBe(false);
    expect(source).toContain('aria-current={active ? "page" : undefined}');
    expect(source).not.toMatch(/AppShell|Sidebar|AppHeader/);
  });

  it("keeps every Team route protected and placeholders non-mutating", async () => {
    for (const file of [
      "src/app/team/page.tsx", "src/app/team/attendance/page.tsx", "src/app/team/leave/page.tsx",
      "src/app/team/delivery/page.tsx", "src/app/team/cash-advance/page.tsx", "src/app/team/profile/page.tsx", "src/app/team/offline/page.tsx",
    ]) expect(await read(file), file).toContain("requireTeamContext()");
    const placeholders = await Promise.all(["src/app/team/leave/page.tsx", "src/app/team/delivery/page.tsx", "src/app/team/cash-advance/page.tsx"].map(read));
    expect(placeholders.join("\n")).not.toMatch(/fetch\(|POST|localStorage|RawDispatch/);
  });

  it("provides a valid Team-scoped manifest and valid PNG dimensions", async () => {
    const value = manifest();
    expect(value).toMatchObject({ name: "NEXTGEN Team", start_url: "/team", scope: "/team", display: "standalone", orientation: "portrait-primary" });
    const icons = value.icons ?? [];
    expect(icons).toHaveLength(2);
    for (const [file, size] of [["public/brand/app-icon-192.png", 192], ["public/brand/app-icon-512.png", 512]] as const) {
      const png = await readFile(`${root}/${file}`);
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      expect(png.readUInt32BE(16)).toBe(size);
      expect(png.readUInt32BE(20)).toBe(size);
    }
  });

  it("detects standalone mode and iOS Safari without exposing an install CTA there", () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal("window", { matchMedia });
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone) AppleWebKit Safari/605.1", platform: "iPhone", maxTouchPoints: 5, standalone: false });
    expect(isStandaloneDisplay()).toBe(true);
    expect(isIosSafari()).toBe(true);
    vi.unstubAllGlobals();
  });

  it("uses an online-first private navigation strategy and never caches API data", async () => {
    const serviceWorker = await read("public/sw.js");
    expect(serviceWorker).toContain('request.mode === "navigate"');
    expect(serviceWorker).toContain('fetch(request, { cache: "no-store" })');
    expect(serviceWorker).toContain('url.pathname.startsWith("/api/")');
    expect(serviceWorker).toContain("OFFLINE_URL");
    expect(serviceWorker).not.toMatch(/IndexedDB|indexedDB|sync\.register|BackgroundSync/);
  });

  it("keeps mobile-safe sizing, safe areas, and iOS input font sizing", async () => {
    const shell = await read("src/components/team/team-shell.tsx");
    const profile = await read("src/components/team/team-profile-client.tsx");
    expect(shell).toContain("env(safe-area-inset-top)");
    expect(shell).toContain("env(safe-area-inset-bottom)");
    expect(shell).toContain("overflow-x-hidden");
    expect(shell).toContain("min-h-14");
    expect(profile).toContain("text-base");
  });
});
