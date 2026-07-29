import { describe, expect, it } from "vitest";
import { pickupSettlementListQuerySchema } from "./pickup-settlement.validation";

function parse(query = "") {
  return pickupSettlementListQuerySchema.safeParse(
    Object.fromEntries(new URL(`https://nextgen.test/api/pickup/settlement${query}`).searchParams),
  );
}

describe("Pickup Settlement query contract", () => {
  it.each([
    "",
    "?operationalDate=",
    "?operationalDate=2026-07-29",
    "?page=&pageSize=&operationalDate=&search=&staff=&paymentStatus=&paymentMethod=",
  ])("accepts optional/empty query %j", (query) => {
    expect(parse(query).success).toBe(true);
  });

  it.each([
    "29-07-2026",
    "2026/07/29",
    "abc",
    "2026-02-30",
  ])("rejects invalid operational date %s", (value) => {
    expect(parse(`?operationalDate=${encodeURIComponent(value)}`).success).toBe(false);
  });

  it("uses the same seven canonical parameter names as the client", () => {
    const names = ["page", "pageSize", "operationalDate", "search", "staff", "paymentStatus", "paymentMethod"];
    const query = new URLSearchParams(Object.fromEntries(names.map((name) => [name, ""])));
    expect([...query.keys()]).toEqual(names);
  });
});
