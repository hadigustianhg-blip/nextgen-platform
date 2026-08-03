import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  canvasBlob,
  createPdfFromJpeg,
  renderSalaryCardCanvas,
  salaryCardFilename,
} from "./salary-recap-detail-client";

const publication = {
  closing: {
    id: "closing-1",
    closingNumber: "SAL/CLS/OUT001/2026/08/0001",
    periodStart: "2026-08-01T00:00:00.000Z",
    periodEnd: "2026-08-02T00:00:00.000Z",
    status: "PROCESSED" as const,
    processedAt: "2026-08-02T11:45:00.000Z",
  },
  identity: {
    brandName: "Tenant Example",
    outletName: "Outlet Example",
    outletCode: "OUT001",
  },
  employee: {
    id: "closing-employee-ena",
    name: "ENA SURYANA",
    division: "ADMIN",
    workDayCount: 2,
    pickupCount: 4,
    dispatchCount: 5,
    whatsappRaw: "081234567890",
    whatsappNormalized: "6281234567890",
  },
  components: [{
    id: "component-1",
    componentName: "Penghasilan Pokok",
    amount: "100000",
  }],
  additions: [{
    id: "addition-1",
    category: "Bonus",
    reason: "Bonus periode",
    amount: "10000",
  }],
  deductions: [{
    id: "deduction-1",
    category: "Koreksi",
    reason: "Koreksi periode",
    amount: "5000",
  }],
  kasbonAllocations: [{
    id: "kasbon-1",
    amount: "30000",
    kasbonSnapshot: {
      operationalDate: "2026-08-01T00:00:00.000Z",
      description: "Kasbon",
    },
  }],
  totals: {
    systemIncome: "100000",
    addition: "10000",
    manualDeduction: "5000",
    kasbon: "30000",
    totalIncome: "110000",
    totalDeduction: "35000",
    netSalary: "75000",
  },
  publicationStatus: "READY" as const,
};

function fakeCanvas() {
  const renderedText: string[] = [];
  const context = {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn((value: string) => renderedText.push(value)),
    measureText: vi.fn((value: string) => ({ width: value.length * 11 })),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
  } as unknown as HTMLCanvasElement;
  return { canvas, context, renderedText };
}

describe("Salary Card export", () => {
  it("renders a self-contained A4 canvas without image resources", () => {
    const fake = fakeCanvas();
    const result = renderSalaryCardCanvas(
      publication,
      new Date("2026-08-02T11:45:00.000Z"),
      true,
      () => fake.canvas,
    );
    expect(result.width).toBe(1240);
    expect(result.height).toBe(1754);
    expect(fake.renderedText).toContain("J&T CARGO / OUT001");
    expect(fake.renderedText).not.toContain("Tenant Example / Outlet Example");
    expect(fake.renderedText.some((value) =>
      value.replace(/\s/g, "") === "Rp75.000"
    )).toBe(true);
    expect(fake.renderedText).toContain("Created by NEXTGEN System");
    expect(fake.renderedText).not.toContain("081234567890");
    expect(fake.renderedText).not.toContain("6281234567890");
  });

  it("creates PNG/JPEG blobs without masking a canvas export failure", async () => {
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], {
      type: "image/png",
    });
    const jpeg = new Blob([new Uint8Array([255, 216, 255])], {
      type: "image/jpeg",
    });
    const canvas = {
      toBlob: vi.fn((callback: BlobCallback, type?: string) => {
        callback(type === "image/png" ? png : jpeg);
      }),
    } as unknown as HTMLCanvasElement;
    await expect(canvasBlob(canvas, "image/png")).resolves.toBe(png);
    await expect(canvasBlob(canvas, "image/jpeg", 0.96)).resolves.toBe(jpeg);
    expect(canvas.toBlob).toHaveBeenCalledTimes(2);

    const failedCanvas = {
      toBlob: vi.fn((callback: BlobCallback) => callback(null)),
    } as unknown as HTMLCanvasElement;
    await expect(canvasBlob(failedCanvas, "image/png"))
      .rejects.toThrow("File Salary Card gagal dibuat.");
  });

  it("builds a one-page A4 PDF from the same origin-clean canvas output", async () => {
    const pdf = createPdfFromJpeg(
      new Uint8Array([255, 216, 255, 217]),
      1240,
      1754,
    );
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/Count 1");
    expect(text).toContain("/MediaBox [0 0 595.28 841.89]");
    expect(text.endsWith("%%EOF")).toBe(true);
  });

  it("uses safe employee-and-period filenames", () => {
    expect(salaryCardFilename(
      "Éna Suryana / Admin",
      "2026-08-01T00:00:00.000Z",
      "2026-08-02T00:00:00.000Z",
      "png",
    )).toBe("slip-gaji-ena-suryana-admin-2026-08-01-2026-08-02.png");
  });

  it("contains no foreignObject, external URL, image, or DOM screenshot path", async () => {
    const source = await readFile(new URL(
      "./salary-recap-detail-client.tsx",
      import.meta.url,
    ), "utf8");
    const renderer = source.slice(
      source.indexOf("export function renderSalaryCardCanvas"),
      source.indexOf("export function canvasBlob"),
    );
    expect(renderer).not.toMatch(
      /foreignObject|drawImage|new Image|background-image|url\(|<img|querySelector|cloneNode/i,
    );
    expect(source).toContain("Kirim WhatsApp - Coming Soon");
    expect(source).toContain("disabled");
  });
});
