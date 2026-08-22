import { describe, expect, it } from "vitest";
import { matchesMonitoringDetailSearch } from "./monitoring-detail-search";

const row = {
  waybill: "WB-001",
  customer: "Budi",
  team: "Team A",
  receiverAddress: "Jalan Melati Nomor 10, Jakarta",
};

describe("Monitoring detail search", () => {
  it("finds delivery rows by receiver address", () => {
    expect(matchesMonitoringDetailSearch(row, "melati nomor 10")).toBe(true);
    expect(matchesMonitoringDetailSearch(row, "surabaya")).toBe(false);
  });

  it("remains safe when receiver address is null", () => {
    expect(matchesMonitoringDetailSearch({ ...row, receiverAddress: null }, "WB-001")).toBe(true);
  });
});
