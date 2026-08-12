import { describe, expect, it } from "vitest";
import { jakartaOperationalDate } from "./jakarta-date";

describe("Asia/Jakarta Timezone Boundary Regression Tests", () => {
  it("resolves exact Asia/Jakarta dates at 00:01, 06:59, 07:01, and 23:59 Jakarta time", () => {
    // 1. 00:01:00 Asia/Jakarta on 2026-08-12 is 2026-08-11 17:01:00 UTC
    const time0001Jakarta = new Date("2026-08-11T17:01:00.000Z");
    expect(jakartaOperationalDate(time0001Jakarta)).toBe("2026-08-12");

    // 2. 06:59:00 Asia/Jakarta on 2026-08-12 is 2026-08-11 23:59:00 UTC
    const time0659Jakarta = new Date("2026-08-11T23:59:00.000Z");
    expect(jakartaOperationalDate(time0659Jakarta)).toBe("2026-08-12");

    // 3. 07:01:00 Asia/Jakarta on 2026-08-12 is 2026-08-12 00:01:00 UTC
    const time0701Jakarta = new Date("2026-08-12T00:01:00.000Z");
    expect(jakartaOperationalDate(time0701Jakarta)).toBe("2026-08-12");

    // 4. 23:59:00 Asia/Jakarta on 2026-08-12 is 2026-08-12 16:59:00 UTC
    const time2359Jakarta = new Date("2026-08-12T16:59:00.000Z");
    expect(jakartaOperationalDate(time2359Jakarta)).toBe("2026-08-12");
  });

  it("prevents regression to UTC .toISOString().slice(0, 10) date handling", () => {
    const lateNightUtc = new Date("2026-08-11T18:00:00.000Z"); // 01:00 AM on Aug 12 in Jakarta
    const utcDateStr = lateNightUtc.toISOString().slice(0, 10);
    const jakartaDateStr = jakartaOperationalDate(lateNightUtc);

    expect(utcDateStr).toBe("2026-08-11");
    expect(jakartaDateStr).toBe("2026-08-12");
    expect(jakartaDateStr).not.toBe(utcDateStr);
  });
});
