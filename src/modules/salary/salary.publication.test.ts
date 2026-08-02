import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ findEmployee: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { salaryClosingEmployee: { findFirst: mocks.findEmployee } },
}));

import { getSalaryRecapEmployeePublication } from "./salary.publication.service";

const decimal = (value: number | string) => new Prisma.Decimal(value);
const scope = { tenantId: "tenant-1", outletId: "outlet-1" };
const finalEmployee = (overrides: Record<string, unknown> = {}) => ({
  id: "closing-employee-ena",
  employeeNameSnapshot: "ENA SURYANA",
  divisionSnapshot: "ADMIN",
  workDayCount: 2,
  sourcePickupCount: 4,
  sourceDispatchCount: 5,
  systemIncomeTotal: decimal(100_000),
  manualAdditionTotal: decimal(10_000),
  manualDeductionTotal: decimal(35_000),
  netSalary: decimal(75_000),
  salaryClosing: {
    id: "closing-1",
    closingNumber: "SAL/CLS/OUT001/2026/08/0001",
    periodStart: new Date("2026-08-01T00:00:00.000Z"),
    periodEnd: new Date("2026-08-02T00:00:00.000Z"),
    status: "PROCESSED",
    processedAt: new Date("2026-08-02T12:00:00.000Z"),
    tenant: { name: "Brand Tenant" },
    outlet: { name: "Outlet Utama", code: "OUT001" },
  },
  components: [{
    id: "component-1",
    componentCode: "BASIC",
    componentName: "Penghasilan Pokok",
    quantity: decimal(2),
    rate: decimal(50_000),
    amount: decimal(100_000),
  }],
  adjustments: [
    {
      id: "addition-1",
      type: "ADDITION",
      category: "Bonus",
      amount: decimal(10_000),
      reason: "Bonus periode",
    },
    {
      id: "deduction-1",
      type: "DEDUCTION",
      category: "Koreksi Potongan",
      amount: decimal(5_000),
      reason: "Koreksi periode",
    },
  ],
  kasbonAllocations: [{
    id: "kasbon-1",
    amount: decimal(30_000),
    kasbonSnapshot: {
      operationalDate: new Date("2026-08-01T00:00:00.000Z"),
      description: "Kasbon",
    },
  }],
  calculationSnapshot: {
    systemIncomeTotal: decimal(100_000),
    manualAdditionTotal: decimal(0),
    manualDeductionTotal: decimal(0),
    netSalary: decimal(100_000),
  },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findEmployee.mockResolvedValue(finalEmployee());
});

describe("per-team Salary Recap publication", () => {
  it("loads only the requested closing employee in the active scope", async () => {
    const result = await getSalaryRecapEmployeePublication(
      scope,
      "closing-1",
      "closing-employee-ena",
    );
    expect(mocks.findEmployee).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "closing-employee-ena",
        salaryClosingId: "closing-1",
        tenantId: "tenant-1",
        outletId: "outlet-1",
      },
    }));
    expect(result.employee).toMatchObject({
      id: "closing-employee-ena",
      name: "ENA SURYANA",
    });
    expect(JSON.stringify(result)).not.toContain("employee-lain");
  });

  it("returns final addition, deductions, Kasbon and exact recap totals", async () => {
    const result = await getSalaryRecapEmployeePublication(
      scope,
      "closing-1",
      "closing-employee-ena",
    );
    expect(result.additions).toHaveLength(1);
    expect(result.deductions).toHaveLength(1);
    expect(result.kasbonAllocations).toHaveLength(1);
    expect(result.totals.systemIncome.toString()).toBe("100000");
    expect(result.totals.addition.toString()).toBe("10000");
    expect(result.totals.manualDeduction.toString()).toBe("5000");
    expect(result.totals.kasbon.toString()).toBe("30000");
    expect(result.totals.totalIncome.toString()).toBe("110000");
    expect(result.totals.totalDeduction.toString()).toBe("35000");
    expect(result.totals.netSalary.toString()).toBe("75000");
  });

  it("uses tenant identity, then outlet identity, then a neutral outlet fallback", async () => {
    await expect(getSalaryRecapEmployeePublication(
      scope,
      "closing-1",
      "closing-employee-ena",
    )).resolves.toMatchObject({ identity: { brandName: "Brand Tenant" } });

    mocks.findEmployee.mockResolvedValueOnce(finalEmployee({
      salaryClosing: {
        ...finalEmployee().salaryClosing,
        tenant: { name: "" },
        outlet: { name: "Outlet Utama", code: "OUT001" },
      },
    }));
    await expect(getSalaryRecapEmployeePublication(
      scope,
      "closing-1",
      "closing-employee-ena",
    )).resolves.toMatchObject({ identity: { brandName: "Outlet Utama" } });

    mocks.findEmployee.mockResolvedValueOnce(finalEmployee({
      salaryClosing: {
        ...finalEmployee().salaryClosing,
        tenant: { name: "" },
        outlet: { name: "", code: "OUT001" },
      },
    }));
    await expect(getSalaryRecapEmployeePublication(
      scope,
      "closing-1",
      "closing-employee-ena",
    )).resolves.toMatchObject({
      identity: { brandName: "J&T CARGO OUT001" },
    });
  });

  it("rejects a closing outside Recap status and an employee outside scope", async () => {
    mocks.findEmployee.mockResolvedValueOnce(finalEmployee({
      salaryClosing: { ...finalEmployee().salaryClosing, status: "CLOSED" },
    }));
    await expect(getSalaryRecapEmployeePublication(
      scope,
      "closing-1",
      "closing-employee-ena",
    )).rejects.toMatchObject({
      code: "SALARY_PUBLICATION_NOT_AVAILABLE",
      status: 409,
    });

    mocks.findEmployee.mockResolvedValueOnce(null);
    await expect(getSalaryRecapEmployeePublication(
      scope,
      "closing-1",
      "other-employee",
    )).rejects.toMatchObject({
      code: "SALARY_PUBLICATION_NOT_FOUND",
      status: 404,
    });
  });

  it("refuses a card when component detail and final totals diverge", async () => {
    mocks.findEmployee.mockResolvedValueOnce(finalEmployee({
      components: [{
        ...finalEmployee().components[0],
        amount: decimal(99_999),
      }],
    }));
    await expect(getSalaryRecapEmployeePublication(
      scope,
      "closing-1",
      "closing-employee-ena",
    )).rejects.toMatchObject({
      code: "SALARY_PUBLICATION_INCONSISTENT",
      status: 409,
    });
  });

  it("keeps the publication UI read-only, dynamic and per team", async () => {
    const [ui, page, listUi, service] = await Promise.all([
      readFile(new URL(
        "../../components/finance/salary-recap-detail-client.tsx",
        import.meta.url,
      ), "utf8"),
      readFile(new URL(
        "../../app/(dashboard)/dashboard/finance/salary-recap/[id]/page.tsx",
        import.meta.url,
      ), "utf8"),
      readFile(new URL(
        "../../components/finance/salary-recap-empty.tsx",
        import.meta.url,
      ), "utf8"),
      readFile(new URL("./salary.publication.service.ts", import.meta.url), "utf8"),
    ]);
    expect(page).toContain("SalaryRecapDetailClient");
    expect(page).not.toContain("SalaryClosingDetailClient");
    expect(listUi).toContain('className="flex flex-wrap gap-2"');
    for (const label of [
      "Publikasikan",
      "Publikasi Salary —",
      "Lihat Rekap",
      "SLIP GAJI",
      "TOTAL BERSIH DITERIMA",
      "Created by NEXTGEN System",
      "Siap Dipublikasikan",
    ]) expect(ui).toContain(label);
    expect(ui).not.toMatch(/>Adjustment<\/button>/);
    expect(ui).not.toMatch(/foto|<img|logo NEXTGEN/i);
    expect(ui).not.toMatch(/\bwindow\.(alert|confirm|prompt)\s*\(/);
    expect(service).not.toMatch(
      /RawPickup|RawDispatch|MasterPickup|calculateEmployeeSalary|captureSalaryClosingSnapshots/,
    );
    expect(service).not.toMatch(/\.(create|update|delete|upsert)\s*\(/);
    expect([ui, service].join("\n")).not.toContain("SUM001A");
  });
});
