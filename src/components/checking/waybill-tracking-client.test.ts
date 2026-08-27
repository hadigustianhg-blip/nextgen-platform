import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { deriveTrackingRoute, formatTrackingTimestamp, newestTrackingEvents } from "./waybill-tracking-client";

const event = (location: string, time: string) => ({ scanTime: time, uploadTime: "", scanTypeName: "Transit", scanNetworkName: location, scanNetworkCode: "", nextStopName: "", nextNetworkCode: "", status: "", code: null, scanMode: "", taskCode: "", description: "" });

describe("waybill tracking UI", () => {
  it("derives consecutive unique routes and reverses a copy for newest-first UI", () => {
    const timeline = [event("Origin", "2026-08-27 08:00:00"), event("Origin", "2026-08-27 09:00:00"), event("Hub", "2026-08-27 10:00:00")];
    expect(deriveTrackingRoute(timeline)).toEqual(["Origin", "Hub"]);
    expect(newestTrackingEvents(timeline)[0].scanNetworkName).toBe("Hub");
    expect(timeline[0].scanNetworkName).toBe("Origin");
  });

  it("formats timezone-less business timestamps as Asia/Jakarta", () => {
    expect(formatTrackingTimestamp("2026-08-27 11:10:00")).toContain("11.10");
    expect(formatTrackingTimestamp("2026-08-27 11:10:00")).toContain("WIB");
  });

  it("contains all stable empty/loading/success/not-found/error and submission contracts", async () => {
    const source = await readFile(new URL("./waybill-tracking-client.tsx", import.meta.url), "utf8");
    for (const contract of ["Masukkan nomor resi untuk melihat perjalanan paket.", "Mengecek perjalanan resi...", "Resi tidak ditemukan.", "Tracking belum dapat diperiksa.", "Status Terakhir", "Riwayat Perjalanan"]) expect(source).toContain(contract);
    for (const detailContract of ["Ringkasan Kiriman", "Informasi Pengirim &amp; Penerima", "Customer", "Nama Barang", "Jumlah Koli", "COD", "Nomor Telepon", "Alamat", "Rincian kiriman belum tersedia."]) expect(source).toContain(detailContract);
    expect(source).toContain('onSubmit={submit}');
    expect(source).toContain('disabled={state === "loading"}');
    expect(source).toContain('if (state === "loading") return');
    expect(source).not.toMatch(/staffContact|AuthToken|phoneNumber/);
    expect(source).not.toContain('href={`tel:');
  });

  it("keeps phone reveal explicit, transient, scoped, and fail-safe", async () => {
    const source = await readFile(new URL("./waybill-tracking-client.tsx", import.meta.url), "utf8");
    const revealFunction = source.slice(source.indexOf("async function revealPhone"), source.indexOf("return ("));
    expect(source.slice(0, source.indexOf("async function revealPhone"))).not.toContain("/api/checking/waybill-tracking/reveal");
    expect(revealFunction).toContain('fetch("/api/checking/waybill-tracking/reveal"');
    expect(revealFunction).toContain('JSON.stringify({ waybillNo: result.waybillNo })');
    expect(revealFunction).not.toMatch(/tenantId|outletId|networkCode|AuthToken/);
    expect(source).toContain('onClick={onReveal}');
    expect(source).toContain('disabled={revealState === "loading"}');
    expect(source).toContain('if (!result || revealState === "loading") return');
    expect(source).toContain('revealedPhone || maskedPhone');
    expect(source).toContain('setRevealedPhone(null)');
    expect(source).toContain('target="_blank" rel="noopener noreferrer"');
    expect(source).toContain("Nomor WhatsApp tidak valid.");
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });
});
