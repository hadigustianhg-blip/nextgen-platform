import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Pickup Settlement UI", () => {
  it("puts updated time first and provides the adjustment modal trigger", async () => {
    const source = await readFile(new URL("./pickup-settlement-client.tsx", import.meta.url), "utf8");
    const headers = source.match(/\["Waktu Diperbarui"[\s\S]*?"Aksi"\]/)?.[0] ?? "";
    expect(headers.indexOf("Waktu Diperbarui")).toBeLessThan(headers.indexOf("Waybill"));
    expect(source).toContain(">Penyesuaian</button>");
    expect(source).toContain('role="dialog"');
    expect(source).toContain("Simpan Penyesuaian");
  });
});
