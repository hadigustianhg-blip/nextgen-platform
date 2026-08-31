import { describe, expect, it, vi } from "vitest";
import {
  applySelectedKasbon,
  resolveSelectedKasbon,
  selectedKasbonTotal,
  toggleKasbonSelection,
} from "./salary-closing-kasbon-selection";

const kasbon = [
  { id: "a", remainingAmount: "50000" },
  { id: "b", remainingAmount: "35500" },
  { id: "c", remainingAmount: "25000" },
];

describe("Salary Closing multi-select Kasbon", () => {
  it("supports one or many checkbox selections and cancel without mutation", () => {
    const one = toggleKasbonSelection([], "a");
    expect(one).toEqual(["a"]);
    const many = toggleKasbonSelection(toggleKasbonSelection(one, "b"), "c");
    expect(many).toEqual(["a", "b", "c"]);
    expect(toggleKasbonSelection(many, "b")).toEqual(["a", "c"]);
    expect(many).toEqual(["a", "b", "c"]);
  });

  it("deduplicates IDs and keeps every selected Kasbon as a separate item", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const applied = await applySelectedKasbon(["a", "b", "a", "c"], kasbon, save);
    expect(applied.map((row) => row.id)).toEqual(["a", "b", "c"]);
    expect(save.mock.calls.map(([row]) => row.id)).toEqual(["a", "b", "c"]);
    expect(save).toHaveBeenCalledTimes(3);
  });

  it("uses exact remaining amounts and preserves the existing aggregate calculation", () => {
    expect(resolveSelectedKasbon(["a"], kasbon)).toEqual([kasbon[0]]);
    expect(selectedKasbonTotal(["a", "b", "c"], kasbon)).toBe(110500);
    const systemIncome = 500000;
    const additions = 10000;
    const manualDeductions = 20000;
    expect(systemIncome + additions - manualDeductions - selectedKasbonTotal(["a", "b", "c"], kasbon))
      .toBe(379500);
  });

  it("removing one selected Kasbon leaves all other selections intact", () => {
    expect(toggleKasbonSelection(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
});
