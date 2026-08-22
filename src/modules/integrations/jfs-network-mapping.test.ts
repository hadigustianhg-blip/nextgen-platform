import { describe, expect, it } from "vitest";
import { isJfsNetworkAllowed, parseJfsDevelopmentNetworkMapping } from "./jfs-network-mapping";

const allowed = (environment: string, outlet: string, network: string, mapping?: string) =>
  isJfsNetworkAllowed({ nextgenOutletCode: outlet, actualJfsNetwork: network, environment, developmentMapping: mapping });

describe("explicit JFS development network mapping", () => {
  it("accepts only the explicitly mapped development network", () => {
    expect(allowed("development", "DEV001", "SUM001A", "DEV001:SUM001A")).toBe(true);
    expect(allowed("development", "DEV001", "OTHER", "DEV001:SUM001A")).toBe(false);
  });

  it("never applies development mapping in production", () => {
    expect(allowed("production", "DEV001", "SUM001A", "DEV001:SUM001A")).toBe(false);
    expect(allowed("production", "SUM001A", "SUM001A", "DEV001:SUM001A")).toBe(true);
  });

  it("fails closed for malformed, wildcard, duplicate, or missing mapping", () => {
    for (const mapping of [undefined, "", "DEV001", "DEV001:*", "*:SUM001A", "DEV001:SUM001A:OTHER", "DEV001:SUM001A,DEV001:OTHER"]) {
      expect(allowed("development", "DEV001", "SUM001A", mapping)).toBe(false);
      expect(parseJfsDevelopmentNetworkMapping(mapping).size).toBe(0);
    }
  });

  it("normalizes case and whitespace without allowing partial matches", () => {
    expect(allowed(" development ", " dev001 ", " sum001a ", " dev001 : sum001a ")).toBe(true);
    expect(allowed("development", "DEV001", "SUM001", "DEV001:SUM001A")).toBe(false);
  });
});
