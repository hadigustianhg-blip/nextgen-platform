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
    const execute = vi.fn().mockResolvedValue({ ...response, rawResponse: { AuthToken: "secret" } });
    const result = await getRealtimeWaybillTracking(scope, "JT123456", execute);
    expect(execute).toHaveBeenCalledWith(scope, "WAYBILL_TRACKING", { waybillNo: "JT123456" });
    expect(result).not.toHaveProperty("rawResponse");
    expect(JSON.stringify(result)).not.toContain("0812-3456-7890");
    expect(JSON.stringify(result)).not.toContain("AuthToken");
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
