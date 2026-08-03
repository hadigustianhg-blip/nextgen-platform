import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ publication: vi.fn() }));
vi.mock("./salary.publication.service", () => ({
  getSalaryRecapEmployeePublication: mocks.publication,
}));

import {
  buildSalaryWhatsappMessage,
  createSalaryPublicationShare,
  createSalaryPublicationShareToken,
  formatSalaryWhatsappPeriod,
  getPublicSalaryCardByToken,
  resolveSalaryPublicBaseUrl,
  verifySalaryPublicationShareToken,
} from "./salary.publication-share.service";

const secret = Buffer.alloc(32, 7).toString("base64");
const decimal = (value: number) => new Prisma.Decimal(value);
const finalPublication = () => ({
  closing: {
    id: "closing-yudi",
    closingNumber: "SAL/CLS/OUT001/2026/07/0001",
    periodStart: new Date("2026-07-01T00:00:00.000Z"),
    periodEnd: new Date("2026-07-31T00:00:00.000Z"),
    status: "PROCESSED",
    processedAt: new Date("2026-08-02T12:00:00.000Z"),
  },
  identity: {
    brandName: "Ignored Tenant",
    outletName: "Ignored Outlet",
    outletCode: "OUT001",
  },
  employee: {
    id: "closing-employee-yudi",
    name: "YUDI MULYADI",
    division: "DRIVER",
    workDayCount: 26,
    pickupCount: 10,
    dispatchCount: 20,
    whatsappRaw: "081234567890",
    whatsappNormalized: "6281234567890",
  },
  components: [{
    id: "component-internal",
    componentName: "Penghasilan Pokok",
    amount: decimal(1_000_000),
  }],
  additions: [],
  deductions: [],
  kasbonAllocations: [],
  totals: {
    systemIncome: decimal(1_000_000),
    addition: decimal(0),
    manualDeduction: decimal(0),
    kasbon: decimal(0),
    totalIncome: decimal(1_000_000),
    totalDeduction: decimal(0),
    netSalary: decimal(1_000_000),
  },
  publicationStatus: "READY",
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.publication.mockResolvedValue(finalPublication());
});

describe("Salary publication secure share", () => {
  it("encrypts one scoped employee and does not expose raw identifiers", () => {
    const token = createSalaryPublicationShareToken({
      closingId: "closing-yudi",
      closingEmployeeId: "closing-employee-yudi",
      tenantId: "tenant-secret",
      outletId: "outlet-secret",
    }, { secret, now: new Date("2026-08-03T00:00:00.000Z") });
    expect(token).not.toContain("closing-yudi");
    expect(token).not.toContain("tenant-secret");
    expect(verifySalaryPublicationShareToken(token, {
      secret,
      now: new Date("2026-08-04T00:00:00.000Z"),
    })).toMatchObject({
      closingId: "closing-yudi",
      closingEmployeeId: "closing-employee-yudi",
      tenantId: "tenant-secret",
      outletId: "outlet-secret",
    });
  });

  it("rejects invalid, tampered, and expired tokens", () => {
    expect(() => verifySalaryPublicationShareToken("invalid", { secret }))
      .toThrow(expect.objectContaining({ code: "SALARY_SHARE_INVALID" }));
    const token = createSalaryPublicationShareToken({
      closingId: "closing-yudi",
      closingEmployeeId: "closing-employee-yudi",
      tenantId: "tenant-1",
      outletId: "outlet-1",
    }, {
      secret,
      now: new Date("2026-08-01T00:00:00.000Z"),
      ttlSeconds: 60,
    });
    expect(() => verifySalaryPublicationShareToken(token, {
      secret,
      now: new Date("2026-08-01T00:01:01.000Z"),
    })).toThrow(expect.objectContaining({ code: "SALARY_SHARE_EXPIRED" }));
    expect(() => verifySalaryPublicationShareToken(`${token}x`, { secret }))
      .toThrow(expect.objectContaining({ code: "SALARY_SHARE_INVALID" }));
  });

  it("loads only the token employee and strips internal/private fields", async () => {
    const token = createSalaryPublicationShareToken({
      closingId: "closing-yudi",
      closingEmployeeId: "closing-employee-yudi",
      tenantId: "tenant-1",
      outletId: "outlet-1",
    }, { secret });
    const card = await getPublicSalaryCardByToken(token, { secret });
    expect(mocks.publication).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      outletId: "outlet-1",
    }, "closing-yudi", "closing-employee-yudi");
    expect(card.employee).toEqual({
      name: "YUDI MULYADI",
      division: "DRIVER",
      workDayCount: 26,
    });
    const serialized = JSON.stringify(card);
    expect(serialized).not.toContain("tenant-1");
    expect(serialized).not.toContain("outlet-1");
    expect(serialized).not.toContain("closing-employee-yudi");
    expect(serialized).not.toContain("6281234567890");
    expect(serialized).not.toContain("component-internal");
    expect(serialized).not.toContain("pickupCount");
    expect(serialized).not.toContain("dispatchCount");
  });

  it("builds an Indonesian employee-specific message and encoded-safe text", () => {
    expect(formatSalaryWhatsappPeriod(
      "2026-07-01T00:00:00.000Z",
      "2026-07-31T00:00:00.000Z",
    )).toBe("Juli 2026");
    expect(formatSalaryWhatsappPeriod(
      "2026-07-31T00:00:00.000Z",
      "2026-08-02T00:00:00.000Z",
    )).toBe("31 Juli 2026 - 02 Agustus 2026");
    const message = buildSalaryWhatsappMessage({
      employeeName: "YUDI MULYADI",
      period: "Juli 2026",
      publicUrl: "https://app.example.test/salary-card/share/token",
    });
    expect(message).toContain("Halo Bpk/Ibu YUDI MULYADI,");
    expect(message).toContain("Slip Gaji periode Juli 2026.");
    expect(message).not.toContain("�");
    const waUrl = new URL("https://wa.me/6281234567890");
    waUrl.searchParams.set("text", message);
    expect(new URL(waUrl).searchParams.get("text")).toBe(message);
  });

  it("creates a 30-day URL from configured/validated application origins", async () => {
    const result = await createSalaryPublicationShare({
      scope: { tenantId: "tenant-1", outletId: "outlet-1" },
      closingId: "closing-yudi",
      closingEmployeeId: "closing-employee-yudi",
      requestUrl: "https://ignored.example.test/api/share",
    }, {
      secret,
      now: new Date("2026-08-03T00:00:00.000Z"),
      environment: {
        NODE_ENV: "production",
        SALARY_PUBLIC_BASE_URL: "https://salary.example.test/dashboard",
      },
    });
    expect(result.publicUrl).toMatch(
      /^https:\/\/salary\.example\.test\/salary-card\/share\/v1\./,
    );
    expect(result.expiresAt.toISOString()).toBe("2026-09-02T00:00:00.000Z");
    expect(result.message).toContain("YUDI MULYADI");
    expect(result.message).not.toContain("Rp");
    expect(mocks.publication).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      outletId: "outlet-1",
    }, "closing-yudi", "closing-employee-yudi");
  });

  it("rejects unsafe production origins and never hardcodes a deployment domain", () => {
    expect(() => resolveSalaryPublicBaseUrl(
      "http://localhost:3000/api/share",
      { NODE_ENV: "production" },
    )).toThrow(expect.objectContaining({
      code: "SALARY_SHARE_BASE_URL_INVALID",
    }));
    expect(resolveSalaryPublicBaseUrl(
      "http://localhost:3000/api/share",
      { NODE_ENV: "development" },
    )).toBe("http://localhost:3000");
  });
});
