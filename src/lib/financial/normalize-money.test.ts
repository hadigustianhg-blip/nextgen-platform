import { describe, expect, it } from "vitest";
import { normalizeMoney } from "./normalize-money";

describe("normalizeMoney", () => {
  it.each([
    [45000.1, 45000],
    [45000.9, 45000],
    [45000.99, 45000],
    ["45000.9", 45000],
    [45000, 45000],
    [null, 0],
  ])("truncates %s to whole rupiah", (input, expected) => {
    expect(normalizeMoney(input)).toBe(expected);
  });

  it.each([-1, "-1.5", "invalid"])("rejects invalid source money %s", (input) => {
    expect(() => normalizeMoney(input)).toThrow("Nominal source tidak valid.");
  });
});
