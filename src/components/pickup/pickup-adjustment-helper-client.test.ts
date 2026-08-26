import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  buildPickupAdjustmentPayload,
  PICKUP_RESOLVER_RETRY_COUNT,
  PICKUP_RESOLVER_RETRY_INTERVAL_MS,
  runPickupAutoSyncFlow,
} from "./pickup-adjustment-helper-client";

const clientPath = new URL("./pickup-adjustment-helper-client.tsx", import.meta.url);
const pagePath = new URL("../../app/helper/pickup-adjustment/page.tsx", import.meta.url);

describe("Pickup adjustment helper", () => {
  it("uses scoped existing endpoints without client scope or JFS credentials", async () => {
    const source = await readFile(clientPath, "utf8");
    expect(source).toContain("/api/pickup/settlements/resolve-by-waybill?waybillNo=");
    expect(source).toContain('fetch("/api/pickup/sync"');
    expect(source).toContain("Penyesuaian Pickup");
    expect(source).toContain("Pickup belum tersedia di NEXTGEN.");
    expect(source).toContain("Coba Lagi");
    expect(source).toContain("onClick={() => void resolveOnly()}");
    expect(source).not.toContain("tenantId");
    expect(source).not.toContain("outletId");
    expect(source).not.toContain("AuthToken");
    expect(source).not.toContain("jfs-middleware");
    expect(source).not.toContain("production.up.railway.app");
  });

  it("does not sync when the initial resolver finds the pickup", async () => {
    const resolve = vi.fn().mockResolvedValue({ kind: "found" as const, data: { pickupId: "pickup-1" } });
    const sync = vi.fn();
    const result = await runPickupAutoSyncFlow({ resolve, sync });
    expect(result.kind).toBe("found");
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(sync).not.toHaveBeenCalled();
  });

  it("runs exactly one sync after initial 404 and resolves a newly available pickup", async () => {
    const resolve = vi.fn()
      .mockResolvedValueOnce({ kind: "missing" as const })
      .mockResolvedValueOnce({ kind: "found" as const, data: { pickupId: "pickup-1" } });
    const sync = vi.fn().mockResolvedValue(true);
    const delay = vi.fn().mockResolvedValue(undefined);
    const result = await runPickupAutoSyncFlow({ resolve, sync, delay });
    expect(result.kind).toBe("found");
    expect(sync).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledWith(PICKUP_RESOLVER_RETRY_INTERVAL_MS);
  });

  it("stops bounded retries without a second automatic sync", async () => {
    const resolve = vi.fn().mockResolvedValue({ kind: "missing" as const });
    const sync = vi.fn().mockResolvedValue(true);
    const delay = vi.fn().mockResolvedValue(undefined);
    const result = await runPickupAutoSyncFlow({ resolve, sync, delay });
    expect(result.kind).toBe("missing");
    expect(sync).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledTimes(1 + PICKUP_RESOLVER_RETRY_COUNT);
    expect(delay).toHaveBeenCalledTimes(PICKUP_RESOLVER_RETRY_COUNT);
  });

  it("stops immediately on sync failure without resolver polling", async () => {
    const resolve = vi.fn().mockResolvedValue({ kind: "missing" as const });
    const sync = vi.fn().mockResolvedValue(false);
    const delay = vi.fn();
    const result = await runPickupAutoSyncFlow({ resolve, sync, delay });
    expect(result.kind).toBe("sync-error");
    expect(sync).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(delay).not.toHaveBeenCalled();
  });

  it.each(["Sesi tidak valid.", "Akses ditolak.", "Nomor waybill tidak valid."])(
    "does not sync for resolver error: %s",
    async (message) => {
      const resolve = vi.fn().mockResolvedValue({ kind: "error" as const, message });
      const sync = vi.fn();
      const result = await runPickupAutoSyncFlow({ resolve, sync });
      expect(result).toEqual({ kind: "error", message });
      expect(sync).not.toHaveBeenCalled();
    },
  );

  it("guards the initial lifecycle flow and keeps manual retry resolver-only", async () => {
    const source = await readFile(clientPath, "utf8");
    expect(source).toContain("if (initialFlowWaybillRef.current === normalizedWaybill) return");
    expect(source).toContain("initialFlowWaybillRef.current = normalizedWaybill");
    expect(source).toContain("const resolveOnly = useCallback");
    const resolveOnlyBody = source.slice(
      source.indexOf("const resolveOnly = useCallback"),
      source.indexOf("const runInitialFlow = useCallback"),
    );
    expect(resolveOnlyBody).not.toContain("requestPickupSync");
  });

  it("uses server-selected operational date and exposes bounded progress states", async () => {
    const source = await readFile(clientPath, "utf8");
    const syncRequestBody = source.slice(
      source.indexOf("const requestPickupSync = useCallback"),
      source.indexOf("const resolveOnly = useCallback"),
    );
    expect(syncRequestBody).toContain('body: "{}"');
    expect(syncRequestBody).not.toContain("operationalDate");
    expect(source).toContain("Memperbarui data pickup...");
    expect(source).toContain("Mencari resi yang baru dibuat...");
    expect(source).toContain("Data pickup belum dapat diperbarui.");
    expect(source).toContain("Data resi belum muncul setelah pembaruan pickup.");
    expect(PICKUP_RESOLVER_RETRY_COUNT).toBe(5);
    expect(PICKUP_RESOLVER_RETRY_COUNT * PICKUP_RESOLVER_RETRY_INTERVAL_MS).toBe(7_500);
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
