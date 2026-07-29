import { describe, expect, it } from "vitest";
import { getSlaCycle, isValidSlaCycle, normalizeAgingSign, summarizeSla } from "./sla-cut-off.calculation";

describe("SLA Cut Off", () => {
  it.each([
    ["2026-07-29", "2026-07-21", "2026-08-20"],
    ["2026-08-10", "2026-07-21", "2026-08-20"],
    ["2026-08-21", "2026-08-21", "2026-09-20"],
    ["2026-08-20", "2026-07-21", "2026-08-20"],
  ])("resolves cycle for %s", (date, startDate, endDate) => {
    expect(getSlaCycle(date)).toEqual({ startDate, endDate });
  });

  it("validates only a 21–20 cycle", () => {
    expect(isValidSlaCycle("2026-07-21", "2026-08-20")).toBe(true);
    expect(isValidSlaCycle("2026-07-01", "2026-07-31")).toBe(false);
  });

  it("uses arithmetic daily SLA average and calculates totals/status", () => {
    const summary = summarizeSla([
      { businessDate: "2026-07-21", sla: 95, paketSampai: 100, sudahTandaTerima: 90, belumTandaTerima: 10, lewatSla: 1 },
      { businessDate: "2026-07-22", sla: 94.99, paketSampai: 200, sudahTandaTerima: 195, belumTandaTerima: 5, lewatSla: 2 },
    ]);
    expect(summary).toEqual({ averageSla: 95, totalPaketSampai: 300, sudahTandaTerima: 285, belumTandaTerima: 15, lewatSla: 3, hariAchieve: 1, hariNotAchieve: 1, status: "NOT_ACHIEVE" });
  });

  it("does not include absent days in the average", () => {
    expect(summarizeSla([{ businessDate: "2026-07-21", sla: 97, paketSampai: 1, sudahTandaTerima: 1, belumTandaTerima: 0, lewatSla: 0 }]).averageSla).toBe(97);
  });

  it("maps the audited snapshot payload", () => {
    expect(normalizeAgingSign({ signTimelyTotal: 270, networkName: "SUM001A", signDelayOtherTotal: 0, signTimelyRate: "96.09%", queryTime: "2026-07-29", sendCenterTotal: 281, signDelayNoSignTotal: 11 })).toMatchObject({ queryTime: "2026-07-29", sendCenterTotal: 281, signTimelyTotal: 270, signDelayNoSignTotal: 11, signDelayOtherTotal: 0 });
  });
});
