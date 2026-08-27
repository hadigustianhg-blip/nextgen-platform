import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { getRealtimeWaybillTracking, WaybillTrackingServiceError } from "./waybill-tracking";

const scope = { tenantId: "tenant-a", outletId: "outlet-a" };
const response = {
  waybillNo: "JT123456",
  latest: { scanTime: "2026-08-27 10:00:00", uploadTime: "", scanTypeName: "Terkirim", scanNetworkName: "SUM001A", scanNetworkCode: "SUM001A", nextStopName: "", nextNetworkCode: "", status: "SIGNED", code: 1, scanMode: "POD", taskCode: "TASK-1" },
  timeline: [{ scanTime: "2026-08-27 10:00:00", uploadTime: "", scanTypeName: "Terkirim", scanNetworkName: "SUM001A", scanNetworkCode: "SUM001A", nextStopName: "", nextNetworkCode: "", status: "SIGNED", code: 1, scanMode: "POD", taskCode: "TASK-1", description: "Diterima penerima 0812-3456-7890" }],
};

describe("realtime waybill tracking service", () => {
  it("calls the scoped operation and returns only the normalized contract", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({ ...response, rawResponse: { AuthToken: "secret" } })
      .mockResolvedValueOnce({
        waybillNo: "JT123456", customerName: "Customer", sender: { name: "Sender", city: "Bandung" },
        receiver: { name: "Receiver", mobileMasked: "(+6*********5612)", address: "Alamat" },
        goods: { name: "Barang", packageNumber: 1 }, codMoney: 0, raw: { orderId: "secret" },
      });
    const result = await getRealtimeWaybillTracking(scope, "JT123456", execute);
    expect(execute).toHaveBeenNthCalledWith(1, scope, "WAYBILL_TRACKING", { waybillNo: "JT123456" });
    expect(execute).toHaveBeenNthCalledWith(2, scope, "WAYBILL_DETAIL", { waybillNo: "JT123456" });
    expect(result.detail?.receiver.mobileMasked).toBe("(+6*********5612)");
    expect(result).not.toHaveProperty("rawResponse");
    expect(JSON.stringify(result)).not.toContain("0812-3456-7890");
    expect(JSON.stringify(result)).not.toContain("AuthToken");
  });

  it("keeps tracking available when detail is not found or temporarily unavailable", async () => {
    const notFound = vi.fn().mockResolvedValueOnce(response).mockRejectedValueOnce(new Error("WAYBILL_DETAIL_NOT_FOUND"));
    await expect(getRealtimeWaybillTracking(scope, "JT123456", notFound)).resolves.toMatchObject({ detail: null, detailStatus: "NOT_FOUND", timeline: [{ description: "Diterima penerima" }] });
    const unavailable = vi.fn().mockResolvedValueOnce(response).mockRejectedValueOnce(new Error("upstream unavailable"));
    await expect(getRealtimeWaybillTracking(scope, "JT123456", unavailable)).resolves.toMatchObject({ detail: null, detailStatus: "UNAVAILABLE", timeline: [{ description: "Diterima penerima" }] });
  });

  it("drops a clear receiver phone and strips forbidden detail fields", async () => {
    const execute = vi.fn().mockResolvedValueOnce(response).mockResolvedValueOnce({
      waybillNo: "JT123456", customerName: "Customer", sender: { name: "Sender", city: "" },
      receiver: { name: "Receiver", mobileMasked: "081234567890", address: "Address" },
      goods: { name: "Goods", packageNumber: 2 }, codMoney: 1000,
      senderMobilePhone: "081111111111", latitude: "-6", orderId: "secret",
    });
    const result = await getRealtimeWaybillTracking(scope, "JT123456", execute);
    expect(result.detail?.receiver.mobileMasked).toBe("");
    expect(JSON.stringify(result)).not.toMatch(/senderMobilePhone|latitude|orderId|081234567890/);
  });

  it("maps middleware not-found and all other failures to safe errors", async () => {
    await expect(getRealtimeWaybillTracking(scope, "JT404", vi.fn().mockRejectedValue(new Error("404 WAYBILL_TRACKING_NOT_FOUND"))))
      .rejects.toMatchObject({ code: "WAYBILL_TRACKING_NOT_FOUND", status: 404 });
    await expect(getRealtimeWaybillTracking(scope, "JT500", vi.fn().mockRejectedValue(new Error("secret upstream body"))))
      .rejects.toEqual(new WaybillTrackingServiceError("TRACKING_UNAVAILABLE", 502));
  });

  it("has no Prisma persistence path", async () => {
    const source = await readFile(new URL("./waybill-tracking.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/@\/lib\/db\/prisma|prisma\.|\.create\(|\.update\(|\.upsert\(|\.delete\(/);
  });
});
