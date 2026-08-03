import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  noStore: vi.fn(),
  getCard: vi.fn(),
}));
vi.mock("next/cache", () => ({ unstable_noStore: mocks.noStore }));
vi.mock("@/modules/salary/salary.publication-share.service", () => ({
  getPublicSalaryCardByShareCode: mocks.getCard,
}));

import ShortSalaryCardPage, { metadata } from "./page";
import { SalaryRecapPublicCard } from "@/components/finance/salary-recap-public-card";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCard.mockResolvedValue({ employee: { name: "TEAM A" } });
});

describe("short Salary Card public route", () => {
  it("loads one card by shareCode with noindex/no-store", async () => {
    const result = await ShortSalaryCardPage({
      params: Promise.resolve({ shareCode: "SLP-7X4A9K" }),
    });
    expect(mocks.noStore).toHaveBeenCalledOnce();
    expect(mocks.getCard).toHaveBeenCalledWith("SLP-7X4A9K");
    expect(result.type).toBe(SalaryRecapPublicCard);
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });

  it("renders a safe expired message without leaking internal data", async () => {
    mocks.getCard.mockRejectedValueOnce(new Error("expired"));
    const result = await ShortSalaryCardPage({
      params: Promise.resolve({ shareCode: "SLP-7X4A9K" }),
    });
    expect(result.type).toBe("main");
    const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain("Link Slip Gaji sudah tidak berlaku.");
    expect(source).not.toMatch(/tenantId|outletId|salaryClosingEmployeeId/);
  });
});
