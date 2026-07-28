import { describe, expect, it } from "vitest";
import { deliverySettlementListSchema } from "./delivery-settlement.validation";

function parseQuery(query = "") {
  return deliverySettlementListSchema.safeParse(
    Object.fromEntries(new URL(`https://nextgen.test/api/delivery-settlement${query}`).searchParams),
  );
}

describe("Delivery Settlement list query contract", () => {
  it.each([
    "",
    "?page=1",
    "?page=1&pageSize=25",
    "?search=",
    "?paymentStatus=",
    "?paymentMethod=",
    "?operationalDate=",
    "?page=1&pageSize=25&operationalDate=&search=&paymentStatus=&paymentMethod=",
  ])("accepts optional and empty query %j", (query) => {
    const result = parseQuery(query);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(25);
      expect(result.data.operationalDate).toBe("");
      expect(result.data.search).toBe("");
      expect(result.data.paymentStatus).toBe("");
      expect(result.data.paymentMethod).toBe("");
    }
  });

  it.each([
    ["", "", ""],
    ["UNCLEARED", "UNPAID", "2026-07-28"],
    ["CLEAR", "CASH", "2026-07-28"],
    ["CLEAR", "TRANSFER", "2026-07-28"],
    ["OVERPAID", "CASH_TRANSFER", "2026-07-28"],
  ] as const)(
    "accepts status=%s, method=%s, date=%s",
    (paymentStatus, paymentMethod, operationalDate) => {
      const query = new URLSearchParams({
        page: "2",
        pageSize: "50",
        operationalDate,
        search: "RIDWAN",
        paymentStatus,
        paymentMethod,
      });
      const result = parseQuery(`?${query}`);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          page: 2,
          pageSize: 50,
          operationalDate,
          search: "RIDWAN",
          paymentStatus,
          paymentMethod,
        });
      }
    },
  );

  it("keeps the six canonical parameter names", () => {
    const names = ["page", "pageSize", "operationalDate", "search", "paymentStatus", "paymentMethod"];
    const query = new URLSearchParams(Object.fromEntries(names.map((name) => [name, ""])));
    expect([...query.keys()]).toEqual(names);
    expect([...query.keys()]).not.toContain("searchch");
  });
});
