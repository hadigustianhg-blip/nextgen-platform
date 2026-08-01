import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const client = readFileSync(new URL("./delivery-settlement-client.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../layout/sidebar.tsx", import.meta.url), "utf8");
const dates = readFileSync(new URL("../../lib/dates/jakarta-date.ts", import.meta.url), "utf8");

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
    expect(client).toContain("Keterangan / Alasan Koreksi");
    expect(client).toContain("Batalkan pembayaran Delivery ini?");
    expect(client).toContain("Ya, Batalkan Pembayaran");
    expect(client).toContain('status: adjustmentStatus');
  });

  it("uses toast-like inline notices and does not use browser alert", () => {
    expect(client).toContain('role="status"');
    expect(client).not.toContain("alert(");
  });

  it("builds list queries with the canonical search parameter", () => {
    expect(client).toContain("operationalDate, search, paymentStatus, paymentMethod");
    expect(client).not.toContain("searchch");
  });

  it("renders filtered COD, QRIS, and DFOD summaries with MetricCard", () => {
    expect(client).toContain("MetricCard");
    expect(client).toContain("money(summary.totalCod)");
    expect(client).toContain("money(summary.totalCodQris)");
    expect(client).toContain("money(summary.totalDfod)");
  });

  it("defaults the date picker and first list request to today in Jakarta", () => {
    expect(client).toContain("useState(jakartaOperationalDate)");
    expect(dates).toContain('timeZone: "Asia/Jakarta"');
    expect(dates).not.toContain("toISOString().slice(0, 10)");
    expect(client).toContain('aria-label="Tanggal operasional"');
    expect(client).toContain("operationalDate,");
  });

  it("keeps empty dates valid for history and resets stale page/modal state", () => {
    expect(client).toContain("setOperationalDate(event.target.value)");
    expect(client).toContain("setPage(1)");
    expect(client).toContain("setSelected(null)");
    expect(client).toContain("setNotice(null)");
    expect(client).not.toContain("setSearch(\"\")");
    expect(client).not.toContain("setPaymentStatus(\"\")");
    expect(client).not.toContain("setPaymentMethod(\"\")");
  });

  it("syncs the active date and safely resolves an empty date to Jakarta today", () => {
    expect(client).toContain("resolveJakartaOperationalDate(operationalDate)");
    expect(client).toContain("JSON.stringify({ operationalDate: syncDate })");
    expect(client).toContain("operationalDate: syncDate");
    expect(client).toContain("await load(refreshedQuery)");
  });

  it("shows a safe fetch-stage message and a short diagnostic reference", () => {
    expect(client).toContain("body.error?.message");
    expect(client).toContain("body.error?.requestId");
    expect(client).toContain("Kode referensi:");
    expect(client).not.toContain("body.error?.target");
    expect(client).not.toContain("body.error?.bodyPreview");
  });
});
