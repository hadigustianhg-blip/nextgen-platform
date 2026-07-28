import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const client = readFileSync(new URL("./delivery-settlement-client.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../layout/sidebar.tsx", import.meta.url), "utf8");

describe("Delivery Settlement UI contract", () => {
  it("shows Delivery directly below Pickup in Settlement Center without RAW menus", () => {
    expect(sidebar.indexOf("Pickup Settlement")).toBeLessThan(sidebar.indexOf("Delivery Settlement"));
    expect(sidebar).not.toContain("RAW_DISPATCH");
    expect(sidebar).not.toContain("RAW_COD");
  });

  it.each(["DFOD", "COD Tunai", "COD QRIS", "Total Setoran", "Bayar Tunai", "Total Transfer", "Total Diterima", "Belum Bayar", "Status", "Aksi"])(
    "contains required table concept %s",
    (label) => expect(client).toContain(label),
  );

  it("contains dynamic adjustment controls and disabled saving state", () => {
    expect(client).toContain("Setor Kurir");
    expect(client).toContain("+ Tambah Transfer");
    expect(client).toContain("Maksimal 8 transfer");
    expect(client).toContain("removeTransfer(index)");
    expect(client).toContain("disabled={saving}");
    expect(client).toContain("Keterangan Belum Bayar");
  });

  it("uses toast-like inline notices and does not use browser alert", () => {
    expect(client).toContain('role="status"');
    expect(client).not.toContain("alert(");
  });

  it("builds list queries with the canonical search parameter", () => {
    expect(client).toContain("operationalDate, search, paymentStatus, paymentMethod");
    expect(client).not.toContain("searchch");
  });
});
