import { describe, expect, it } from "vitest";
import { jakartaOperationalDate } from "./pickup-date";

describe("Pickup Settlement Jakarta date", () => {
  it("uses Asia/Jakarta instead of the raw UTC date", () => {
    expect(jakartaOperationalDate(new Date("2026-07-28T18:00:00.000Z"))).toBe("2026-07-29");
  });

  it("keeps the previous Jakarta day before midnight", () => {
    expect(jakartaOperationalDate(new Date("2026-07-28T16:59:59.000Z"))).toBe("2026-07-28");
  });
});
