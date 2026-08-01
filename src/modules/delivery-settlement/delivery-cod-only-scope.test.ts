import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./delivery-settlement.service.ts", import.meta.url), "utf8");

describe("Delivery Settlement COD-only scope", () => {
  it("builds the obligation from DFOD and COD cash only", () => {
    expect(service).toContain("candidate.dfod.plus(candidate.codCash)");
    expect(service).not.toContain("masterPickup");
    expect(service).not.toContain("rawPickup");
    expect(service).not.toContain("pickupCashAmount");
  });

  it("does not create Delivery rows for pickup-only teams", () => {
    expect(service).not.toContain("DINI SETIANI");
    expect(service).not.toContain("RAIDI GS");
    expect(service).not.toContain("settlementRaw");
  });
});
