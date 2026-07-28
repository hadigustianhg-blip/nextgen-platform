import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("pickup navigation", () => {
  it("hides RAW Pickup and exposes Pickup Settlement under Settlement Center", async () => {
    const source = await readFile(new URL("./sidebar.tsx", import.meta.url), "utf8");
    expect(source).not.toContain('label: "RAW Pickup"');
    expect(source).toContain("Settlement Center");
    expect(source).toContain('href="/dashboard/settlement/pickup"');
    expect(source).toContain("Pickup Settlement");
  });
});
