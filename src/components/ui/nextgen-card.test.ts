import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("NEXTGEN shared card system", () => {
  const shared = read("src/components/ui/nextgen-card.tsx");
  const targetPages = [
    "src/components/operational-settlement/operational-settlement-client.tsx",
    "src/components/payment/payment-settlement-client.tsx",
    "src/components/payment/pickup-payment-client.tsx",
    "src/components/payment/cash-flow-client.tsx",
  ];

  it("keeps the official card, control, and metric tokens in one shared module", () => {
    expect(shared).toContain(
      "rounded-2xl border border-slate-200 bg-white shadow-sm",
    );
    expect(shared).toContain("h-11 rounded-xl border border-slate-200");
    expect(shared).toContain("text-sm font-medium text-slate-500");
    expect(shared).toContain("text-2xl font-bold");
  });

  it.each(targetPages)("%s consumes the reusable card primitives", (file) => {
    const source = read(file);
    expect(source).toContain("PageHeader");
    expect(source).toContain("MetricCard");
    expect(source).toContain("FilterCard");
    expect(source).toContain("TableCard");
    expect(source).toContain("ModalCard");
  });
});
