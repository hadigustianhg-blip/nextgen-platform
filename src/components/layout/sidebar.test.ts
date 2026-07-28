import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("pickup navigation", () => {
  it("exposes clickable RAW and Master Pickup menu paths", async () => {
    const source = await readFile(new URL("./sidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain('href: "/dashboard/pickup/raw"');
    expect(source).toContain('href: "/dashboard/pickup/master"');
  });
});
