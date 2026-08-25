import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildPickupAdjustmentPayload } from "./pickup-adjustment-helper-client";

const clientPath = new URL("./pickup-adjustment-helper-client.tsx", import.meta.url);
const pagePath = new URL("../../app/helper/pickup-adjustment/page.tsx", import.meta.url);

describe("Pickup adjustment helper", () => {
  it("uses the scoped resolver, renders the form, and retries without calling sync", async () => {
    const source = await readFile(clientPath, "utf8");
    expect(source).toContain("/api/pickup/settlements/resolve-by-waybill?waybillNo=");
    expect(source).toContain("Penyesuaian Pickup");
    expect(source).toContain("Pickup belum tersedia di NEXTGEN.");
    expect(source).toContain("Coba Lagi");
    expect(source).toContain("onClick={() => void resolvePickup()}");
    expect(source).not.toContain("/api/pickup/sync");
    expect(source).not.toContain("tenantId");
    expect(source).not.toContain("outletId");
    expect(source).not.toContain("jfs-middleware");
    expect(source).not.toContain("production.up.railway.app");
  });

  it("uses existing detail, transfer account, and adjustment endpoints", async () => {
    const source = await readFile(clientPath, "utf8");
    expect(source).toContain("`/api/pickup/settlements/${resolved.pickupId}`");
    expect(source).toContain('fetch("/api/pickup/transfer-accounts"');
    expect(source).toContain("`/api/pickup/settlements/${pickup.pickupId}/adjust`");
    expect(source).toContain("crypto.randomUUID()");
    expect(source).toContain("Pilih rekening transfer terlebih dahulu.");
    expect(source).toContain("Alasan pembatalan wajib diisi.");
    expect(source).toContain("Ya, Batalkan Pembayaran");
    expect(source).toContain("Penyesuaian berhasil disimpan.");
  });

  it("clears payment details for BELUM_BAYAR and requires an account for transfer", () => {
    const unpaid = buildPickupAdjustmentPayload({
      requestId: "7b5db233-c630-4f8b-8cc2-32eb63fe024a",
      discount: "1000",
      status: "BELUM_BAYAR",
      method: "TRANSFER",
      accountId: "BCA",
      note: "  koreksi  ",
    });
    expect(unpaid).toMatchObject({ paymentMethod: null, transferAccountId: null, note: "koreksi" });

    const transfer = buildPickupAdjustmentPayload({
      requestId: "7b5db233-c630-4f8b-8cc2-32eb63fe024a",
      discount: "0",
      status: "SUDAH_BAYAR",
      method: "TRANSFER",
      accountId: "",
      note: "",
    });
    expect(transfer.transferAccountId).toBeNull();
  });

  it("requires the existing authenticated admin session at the page boundary", async () => {
    const source = await readFile(pagePath, "utf8");
    expect(source).toContain("await requireSession()");
    expect(source).toContain("waybillNo={waybillNo}");
    expect(source).not.toContain("tenantId");
    expect(source).not.toContain("outletId");
  });
});
