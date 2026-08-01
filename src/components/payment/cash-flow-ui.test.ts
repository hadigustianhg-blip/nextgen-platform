import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./cash-flow-client.tsx", import.meta.url),
  "utf8",
);

describe("Cash Flow Payment period UI", () => {
  it("initializes the existing date inputs with the Jakarta current-month range", () => {
    expect(source).toContain("jakartaCurrentMonthRange()");
    expect(source).toContain("startDate: defaultPeriod.startDate");
    expect(source).toContain("endDate: defaultPeriod.endDate");
  });

  it("renders the specified empty state without adding native dialogs", () => {
    expect(source).toContain("Belum ada transaksi Cash Flow pada periode ini.");
    expect(source).not.toContain("window.alert(");
    expect(source).not.toContain("window.confirm(");
  });
});
