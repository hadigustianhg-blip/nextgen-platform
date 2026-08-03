"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Download,
  Eye,
  FileDown,
  LoaderCircle,
  Megaphone,
  MessageCircle,
  Undo2,
  X,
} from "lucide-react";
import {
  AppCard,
  MetricCard,
  ModalCard,
  PageHeader,
  SectionCard,
  TableCard,
  nextgenButtonClass,
  nextgenControlClass,
  nextgenNeutralButtonClass,
} from "@/components/ui";

type RecapEmployee = {
  id: string;
  employeeNameSnapshot: string;
  divisionSnapshot: string;
  workDayCount: number;
  sourcePickupCount: number;
  sourceDispatchCount: number;
  systemIncomeTotal: string;
  manualAdditionTotal: string;
  manualDeductionTotal: string;
  netSalary: string;
};

type Recap = {
  id: string;
  closingNumber: string;
  periodStart: string;
  periodEnd: string;
  status: "PROCESSED" | "PAID";
  processedAt: string | null;
  canCancelRecap: boolean;
  cancelBlockReason: string | null;
  employees: RecapEmployee[];
};

type PublicationLine = {
  id: string;
  componentName?: string;
  category?: string;
  reason?: string;
  amount: string;
  quantity?: string | null;
  rate?: string | null;
};

type Publication = {
  closing: {
    id: string;
    closingNumber: string;
    periodStart: string;
    periodEnd: string;
    status: "PROCESSED" | "PAID";
    processedAt: string | null;
  };
  identity: {
    brandName: string;
    outletName: string | null;
    outletCode: string;
  };
  employee: {
    id: string;
    name: string;
    division: string;
    workDayCount: number;
    pickupCount: number;
    dispatchCount: number;
    whatsappRaw: string | null;
    whatsappNormalized: string | null;
  };
  components: PublicationLine[];
  additions: PublicationLine[];
  deductions: PublicationLine[];
  kasbonAllocations: Array<PublicationLine & {
    kasbonSnapshot: {
      operationalDate: string;
      description: string | null;
    } | null;
  }>;
  totals: {
    systemIncome: string;
    addition: string;
    manualDeduction: string;
    kasbon: string;
    totalIncome: string;
    totalDeduction: string;
    netSalary: string;
  };
  publicationStatus: "READY";
};

export type SalaryCardData = {
  closing: {
    closingNumber: string;
    periodStart: string;
    periodEnd: string;
    processedAt: string | null;
  };
  identity: { outletCode: string };
  employee: {
    name: string;
    division: string;
    workDayCount: number;
  };
  components: Array<{ componentName?: string; amount: string }>;
  additions: Array<{
    category?: string;
    reason?: string;
    amount: string;
  }>;
  deductions: Array<{
    category?: string;
    reason?: string;
    amount: string;
  }>;
  kasbonAllocations: Array<{
    amount: string;
    kasbonSnapshot?: { description: string | null } | null;
  }>;
  totals: Publication["totals"];
};

const divisionLabel: Record<string, string> = {
  ADMIN: "Admin",
  ADMIN_OPS: "Admin Ops",
  SALES: "Sales",
  THREE_WHEEL_DRIVER: "Driver Roda Tiga",
  MOTORIST: "Motoris",
  DRIVER: "Driver",
};
const rupiah = (value: string | number) => new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
}).format(Number(value));
const formatPeriod = (start: string, end: string) =>
  `${start.slice(0, 10)} — ${end.slice(0, 10)}`;
const formatDocumentDate = (value: string | Date) => {
  const date = typeof value === "string"
    ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`)
    : value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: typeof value === "string" ? "UTC" : "Asia/Jakarta",
  }).format(date);
};
const formatPublishTime = (value: Date) => `${new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Jakarta",
}).format(value).replace(".", ":")} WIB`;
const safeFilename = (value: string) => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .toLowerCase();

const publicationBrand = (publication: SalaryCardData) =>
  `J&T CARGO / ${publication.identity.outletCode}`;

const fitCanvasText = (
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
) => {
  if (context.measureText(value).width <= maxWidth) return value;
  let text = value;
  while (text.length && context.measureText(`${text}...`).width > maxWidth) {
    text = text.slice(0, -1);
  }
  return `${text}...`;
};

export function salaryCardFilename(
  employeeName: string,
  periodStart: string,
  periodEnd: string,
  extension: "png" | "pdf",
) {
  const period = periodStart.slice(0, 10) === periodEnd.slice(0, 10)
    ? periodStart.slice(0, 10)
    : `${periodStart.slice(0, 10)}-${periodEnd.slice(0, 10)}`;
  return `slip-gaji-${safeFilename(employeeName)}-${period}.${extension}`;
}

export function renderSalaryCardCanvas(
  publication: SalaryCardData,
  publishedAt: Date,
  showDetails: boolean,
  createCanvas: () => HTMLCanvasElement = () => document.createElement("canvas"),
) {
  const canvas = createCanvas();
  canvas.width = 1240;
  canvas.height = 1754;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas tidak tersedia.");
  const left = 80;
  const right = 1160;
  const width = right - left;
  const systemFont = "Arial, Helvetica, sans-serif";
  const text = (
    value: string,
    x: number,
    y: number,
    options: {
      color?: string;
      font?: string;
      align?: CanvasTextAlign;
      maxWidth?: number;
    } = {},
  ) => {
    context.fillStyle = options.color || "#172033";
    context.font = options.font || `24px ${systemFont}`;
    context.textAlign = options.align || "left";
    context.textBaseline = "alphabetic";
    context.fillText(
      options.maxWidth ? fitCanvasText(context, value, options.maxWidth) : value,
      x,
      y,
    );
  };
  const line = (y: number, color = "#d8dee8", size = 1) => {
    context.beginPath();
    context.strokeStyle = color;
    context.lineWidth = size;
    context.moveTo(left, y);
    context.lineTo(right, y);
    context.stroke();
  };
  const moneyRow = (
    label: string,
    amount: string,
    y: number,
    options: { detail?: boolean; total?: boolean; deduction?: boolean } = {},
  ) => {
    const font = options.total
      ? `bold 25px ${systemFont}`
      : options.detail
        ? `20px ${systemFont}`
        : `23px ${systemFont}`;
    const color = options.detail
      ? "#64748b"
      : options.deduction && Number(amount) > 0
        ? "#be123c"
        : "#172033";
    text(label, left + (options.detail ? 24 : 0), y, {
      color,
      font,
      maxWidth: 720,
    });
    text(rupiah(amount), right, y, { color, font, align: "right" });
  };

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#102a43";
  context.fillRect(0, 0, canvas.width, 270);
  text(publicationBrand(publication), left, 82, {
    color: "#ffffff",
    font: `bold 36px ${systemFont}`,
    maxWidth: 690,
  });
  text("SLIP GAJI", right, 70, {
    color: "#d8e4f0",
    font: `bold 22px ${systemFont}`,
    align: "right",
  });
  text(publication.closing.closingNumber, right, 112, {
    color: "#ffffff",
    font: `bold 21px ${systemFont}`,
    align: "right",
    maxWidth: 430,
  });
  context.strokeStyle = "rgba(255,255,255,0.25)";
  context.beginPath();
  context.moveTo(left, 155);
  context.lineTo(right, 155);
  context.stroke();
  text("PERIODE", left, 195, {
    color: "#cbd5e1",
    font: `18px ${systemFont}`,
  });
  text(`${formatDocumentDate(publication.closing.periodStart)} - ${formatDocumentDate(publication.closing.periodEnd)}`, left, 230, {
    color: "#ffffff",
    font: `bold 21px ${systemFont}`,
  });
  text("TANGGAL PUBLISH", right, 195, {
    color: "#cbd5e1",
    font: `18px ${systemFont}`,
    align: "right",
  });
  text(formatDocumentDate(publishedAt), right, 230, {
    color: "#ffffff",
    font: `bold 21px ${systemFont}`,
    align: "right",
  });

  text("IDENTITAS TEAM", left, 330, {
    color: "#64748b",
    font: `bold 18px ${systemFont}`,
  });
  line(348);
  const identity = [
    ["Nama", publication.employee.name],
    ["Divisi", divisionLabel[publication.employee.division] ?? publication.employee.division],
    ["Hari Kerja", String(publication.employee.workDayCount)],
    ["Status", "Siap Dipublikasikan"],
    ["Tanggal Publish", `${formatDocumentDate(publishedAt)}, ${formatPublishTime(publishedAt)}`],
  ];
  identity.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = left + column * 550;
    const y = 395 + row * 62;
    text(label, x, y, { color: "#64748b", font: `18px ${systemFont}` });
    text(value, x, y + 28, {
      font: `bold 22px ${systemFont}`,
      maxWidth: column === 0 ? 500 : 520,
    });
  });

  type ExportRow = {
    label: string;
    amount: string;
    detail?: boolean;
    deduction?: boolean;
  };
  const incomeRows: ExportRow[] = [
    { label: "Penghasilan Sistem", amount: publication.totals.systemIncome },
    ...(showDetails ? publication.components.map((row) => ({
      label: row.componentName || "Komponen Penghasilan",
      amount: row.amount,
      detail: true,
    })) : []),
    { label: "Tambahan", amount: publication.totals.addition },
    ...(showDetails ? publication.additions.map((row) => ({
      label: `${row.category || "Tambahan"} - ${row.reason || ""}`,
      amount: row.amount,
      detail: true,
    })) : []),
  ];
  const deductionRows: ExportRow[] = [
    { label: "Potongan Kasbon", amount: publication.totals.kasbon, deduction: true },
    ...(showDetails ? publication.kasbonAllocations.map((row) => ({
      label: row.kasbonSnapshot?.description || "Kasbon",
      amount: row.amount,
      detail: true,
      deduction: true,
    })) : []),
    { label: "Potongan Manual", amount: publication.totals.manualDeduction, deduction: true },
    ...(showDetails ? publication.deductions.map((row) => ({
      label: `${row.category || "Potongan"} - ${row.reason || ""}`,
      amount: row.amount,
      detail: true,
      deduction: true,
    })) : []),
  ];
  const rowCount = incomeRows.length + deductionRows.length + 4;
  const rowHeight = Math.min(50, Math.max(22, Math.floor(700 / rowCount)));
  let y = 605;
  text("RINCIAN PENGHASILAN", left, y, {
    color: "#64748b",
    font: `bold 18px ${systemFont}`,
  });
  line(y + 18);
  y += 62;
  incomeRows.forEach((row) => {
    moneyRow(row.label, row.amount, y, { detail: row.detail });
    y += rowHeight;
    line(y - 17);
  });
  line(y - 14, "#64748b", 2);
  moneyRow("TOTAL PENGHASILAN", publication.totals.totalIncome, y + 22, { total: true });
  y += rowHeight + 65;

  text("RINCIAN POTONGAN", left, y, {
    color: "#64748b",
    font: `bold 18px ${systemFont}`,
  });
  line(y + 18);
  y += 62;
  deductionRows.forEach((row) => {
    moneyRow(row.label, row.amount, y, {
      detail: row.detail,
      deduction: row.deduction,
    });
    y += rowHeight;
    line(y - 17);
  });
  line(y - 14, "#64748b", 2);
  moneyRow("TOTAL POTONGAN", publication.totals.totalDeduction, y + 22, {
    total: true,
    deduction: true,
  });

  context.fillStyle = "#ecfdf5";
  context.fillRect(left, 1430, width, 165);
  context.strokeStyle = "#047857";
  context.lineWidth = 3;
  context.strokeRect(left, 1430, width, 165);
  text("TOTAL DITERIMA", canvas.width / 2, 1483, {
    color: "#065f46",
    font: `bold 19px ${systemFont}`,
    align: "center",
  });
  text(rupiah(publication.totals.netSalary), canvas.width / 2, 1558, {
    color: "#065f46",
    font: `bold 56px ${systemFont}`,
    align: "center",
    maxWidth: 960,
  });

  context.fillStyle = "#f8fafc";
  context.fillRect(0, 1635, canvas.width, 119);
  line(1635);
  text("Dipublikasikan:", left, 1670, {
    color: "#64748b",
    font: `16px ${systemFont}`,
  });
  text(formatDocumentDate(publishedAt), left, 1698, {
    font: `bold 17px ${systemFont}`,
  });
  text(formatPublishTime(publishedAt), left, 1723, {
    color: "#64748b",
    font: `16px ${systemFont}`,
  });
  text("Created by NEXTGEN System", right, 1710, {
    color: "#64748b",
    font: `14px ${systemFont}`,
    align: "right",
  });
  return canvas;
}

export function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("File Salary Card gagal dibuat."));
    }, type, quality);
  });
}

export function createPdfFromJpeg(jpeg: Uint8Array, width: number, height: number) {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets = [0];
  let byteLength = 0;
  const append = (value: string | Uint8Array) => {
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    parts.push(bytes);
    byteLength += bytes.byteLength;
  };
  const object = (id: number, body: string | Uint8Array[]) => {
    offsets[id] = byteLength;
    append(`${id} 0 obj\n`);
    if (typeof body === "string") append(body);
    else body.forEach(append);
    append("\nendobj\n");
  };
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const imageRatio = width / height;
  const pageRatio = pageWidth / pageHeight;
  const renderWidth = imageRatio > pageRatio ? pageWidth : pageHeight * imageRatio;
  const renderHeight = imageRatio > pageRatio ? pageWidth / imageRatio : pageHeight;
  const offsetX = (pageWidth - renderWidth) / 2;
  const offsetY = (pageHeight - renderHeight) / 2;
  const content = `q ${renderWidth.toFixed(2)} 0 0 ${renderHeight.toFixed(2)} ${offsetX.toFixed(2)} ${offsetY.toFixed(2)} cm /Im0 Do Q`;

  append("%PDF-1.4\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  object(4, [
    encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.byteLength} >>\nstream\n`),
    jpeg,
    encoder.encode("\nendstream"),
  ]);
  object(5, `<< /Length ${encoder.encode(content).byteLength} >>\nstream\n${content}\nendstream`);
  const xrefOffset = byteLength;
  append("xref\n0 6\n0000000000 65535 f \n");
  for (let id = 1; id <= 5; id += 1) {
    append(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return new Blob(parts.map((part) => part.buffer.slice(
    part.byteOffset,
    part.byteOffset + part.byteLength,
  ) as ArrayBuffer), { type: "application/pdf" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function SalaryRecapDetailClient({ closingId }: { closingId: string }) {
  const [recap, setRecap] = useState<Recap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [publication, setPublication] = useState<Publication | null>(null);
  const [publicationOpen, setPublicationOpen] = useState(false);
  const [publicationLoading, setPublicationLoading] = useState(false);
  const [publicationError, setPublicationError] = useState("");
  const [showRecap, setShowRecap] = useState(false);
  const [publishedAt, setPublishedAt] = useState<Date | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "png" | null>(null);
  const [sharingWhatsapp, setSharingWhatsapp] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    queueMicrotask(async () => {
      try {
        const response = await fetch(`/api/finance/salary/recaps/${closingId}`, {
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) throw new Error(
          result.error?.message || "Detail Salary Recap gagal dimuat.",
        );
        setRecap(result.data);
      } catch (cause) {
        setError(cause instanceof Error
          ? cause.message
          : "Detail Salary Recap gagal dimuat.");
      } finally {
        setLoading(false);
      }
    });
  }, [closingId]);

  async function openPublication(employeeId: string) {
    if (publicationLoading) return;
    setPublication(null);
    setPublicationError("");
    setShowRecap(false);
    setPublishedAt(null);
    setSharingWhatsapp(false);
    setPublicationOpen(true);
    setPublicationLoading(true);
    try {
      const response = await fetch(
        `/api/finance/salary/recaps/${closingId}/employees/${employeeId}/publication`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(
        result.error?.message || "Salary Card gagal dimuat.",
      );
      setPublication(result.data);
      setPublishedAt(new Date());
    } catch (cause) {
      setPublicationError(cause instanceof Error
        ? cause.message
        : "Salary Card gagal dimuat.");
    } finally {
      setPublicationLoading(false);
    }
  }

  async function downloadPublication(format: "pdf" | "png") {
    if (!publication || !publishedAt || exporting) return;
    setExporting(format);
    setPublicationError("");
    try {
      await document.fonts.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const canvas = renderSalaryCardCanvas(publication, publishedAt, showRecap);
      if (format === "png") {
        const png = await canvasBlob(canvas, "image/png");
        downloadBlob(png, salaryCardFilename(
          publication.employee.name,
          publication.closing.periodStart,
          publication.closing.periodEnd,
          "png",
        ));
      } else {
        const jpegBlob = await canvasBlob(canvas, "image/jpeg", 0.96);
        const jpeg = new Uint8Array(await jpegBlob.arrayBuffer());
        downloadBlob(
          createPdfFromJpeg(jpeg, canvas.width, canvas.height),
          salaryCardFilename(
            publication.employee.name,
            publication.closing.periodStart,
            publication.closing.periodEnd,
            "pdf",
          ),
        );
      }
    } catch (cause) {
      setPublicationError(cause instanceof Error
        ? cause.message
        : "Salary Card gagal diunduh.");
    } finally {
      setExporting(null);
    }
  }

  async function sharePublicationToWhatsapp() {
    const number = publication?.employee.whatsappNormalized;
    if (!publication || !number || !/^\d{8,15}$/.test(number)) {
      setPublicationError("Nomor WhatsApp team belum tersedia atau tidak valid.");
      return;
    }
    if (sharingWhatsapp) return;
    setSharingWhatsapp(true);
    setPublicationError("");
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    try {
      const response = await fetch(
        `/api/finance/salary/recaps/${closingId}/employees/${publication.employee.id}/publication/share`,
        { method: "POST", cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok || !result.data?.publicUrl || !result.data?.message) {
        throw new Error(
          result.error?.message || "Tautan Salary Card gagal dibuat.",
        );
      }
      const whatsappUrl = new URL(`https://wa.me/${number}`);
      whatsappUrl.searchParams.set("text", result.data.message);
      if (whatsappUrl.toString().includes("�")) {
        throw new Error("Pesan WhatsApp tidak dapat dibentuk dengan aman.");
      }
      if (popup) popup.location.href = whatsappUrl.toString();
      else {
        const opened = window.open(
          whatsappUrl.toString(),
          "_blank",
          "noopener,noreferrer",
        );
        if (!opened) throw new Error("Popup WhatsApp diblokir browser.");
      }
    } catch (cause) {
      popup?.close();
      setPublicationError(cause instanceof Error
        ? cause.message
        : "Tautan Salary Card gagal dibuat.");
    } finally {
      setSharingWhatsapp(false);
    }
  }

  async function cancelRecap() {
    if (cancelLoading || cancelReason.trim().length < 5) {
      if (cancelReason.trim().length < 5) {
        setError("Alasan pembatalan minimal 5 karakter.");
      }
      return;
    }
    setCancelLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/finance/salary/recaps/${closingId}/cancel`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: cancelReason }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(
        result.error?.message || "Salary Recap gagal dibatalkan.",
      );
      setCancelOpen(false);
      setCancelled(true);
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : "Salary Recap gagal dibatalkan.");
    } finally {
      setCancelLoading(false);
    }
  }

  if (loading) {
    return <div className="grid min-h-64 place-items-center">
      <LoaderCircle className="animate-spin text-blue-600"/>
    </div>;
  }
  if (cancelled) {
    return <div className="space-y-4">
      <div role="status"
        className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
        Salary Recap berhasil dibatalkan dan dikembalikan ke Dalam Review.
      </div>
      <Link href={`/dashboard/finance/salary-closing/${closingId}`}
        className={nextgenButtonClass}>Buka Salary Closing</Link>
    </div>;
  }
  if (!recap) return <p>{error || "Salary Recap tidak ditemukan."}</p>;

  const totals = recap.employees.reduce((sum, employee) => ({
    system: sum.system + Number(employee.systemIncomeTotal),
    addition: sum.addition + Number(employee.manualAdditionTotal),
    deduction: sum.deduction + Number(employee.manualDeductionTotal),
    net: sum.net + Number(employee.netSalary),
  }), { system: 0, addition: 0, deduction: 0, net: 0 });
  const whatsappReady = publication?.employee.whatsappNormalized
    ? /^\d{8,15}$/.test(publication.employee.whatsappNormalized)
    : false;

  return <div className="space-y-6">
    <PageHeader eyebrow="Finance & HR" title={recap.closingNumber}
      description={formatPeriod(recap.periodStart, recap.periodEnd)}
      actions={<>
        <Link href="/dashboard/finance/salary-recap"
          className={nextgenNeutralButtonClass}>Kembali</Link>
        {recap.canCancelRecap && <button type="button"
          disabled={cancelLoading}
          onClick={() => {
            setCancelReason("");
            setCancelOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50">
          <Undo2 size={16}/>Batalkan Rekap
        </button>}
      </>}/>
    {error && <div role="alert"
      className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
      {error}
    </div>}
    {recap.cancelBlockReason && <div
      className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
      {recap.cancelBlockReason}
    </div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Jumlah Team" value={recap.employees.length}/>
      <MetricCard label="Penghasilan Sistem" value={rupiah(totals.system)}/>
      <MetricCard label="Total Potongan" value={rupiah(totals.deduction)}/>
      <MetricCard label="Total Bersih" value={rupiah(totals.net)}/>
    </div>
    <SectionCard title="Team Salary">
      <TableCard><div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>
            {["Nama", "Divisi", "Hari Kerja", "Pickup", "Dispatch",
              "Penghasilan Sistem", "Tambahan", "Potongan", "Total Bersih",
              "Status", "Aksi"].map((label) =>
              <th key={label} className="px-3 py-3">{label}</th>)}
          </tr></thead>
          <tbody className="divide-y">{recap.employees.map((employee) =>
            <tr key={employee.id}>
              <td className="px-3 py-3 font-semibold">{employee.employeeNameSnapshot}</td>
              <td className="px-3 py-3">{divisionLabel[employee.divisionSnapshot] ?? employee.divisionSnapshot}</td>
              <td className="px-3 py-3">{employee.workDayCount}</td>
              <td className="px-3 py-3">{employee.sourcePickupCount}</td>
              <td className="px-3 py-3">{employee.sourceDispatchCount}</td>
              <td className="px-3 py-3">{rupiah(employee.systemIncomeTotal)}</td>
              <td className="px-3 py-3">{rupiah(employee.manualAdditionTotal)}</td>
              <td className="px-3 py-3">{rupiah(employee.manualDeductionTotal)}</td>
              <td className="px-3 py-3 font-bold">{rupiah(employee.netSalary)}</td>
              <td className="px-3 py-3 font-semibold text-emerald-700">
                Siap Dipublikasikan
              </td>
              <td className="px-3 py-3"><button type="button"
                disabled={publicationLoading}
                onClick={() => void openPublication(employee.id)}
                className={nextgenButtonClass}>
                <Megaphone size={16}/>Publikasikan
              </button></td>
            </tr>)}</tbody>
        </table>
      </div></TableCard>
    </SectionCard>

    {publicationOpen && <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-3">
      <ModalCard className="flex max-h-[94vh] max-w-6xl flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b p-5">
          <div>
            <p className="text-sm text-slate-500">Publikasi Salary per Team</p>
            <h2 className="text-xl font-bold">
              Publikasi Salary — {publication?.employee.name ?? "Memuat..."}
            </h2>
          </div>
          <button type="button" disabled={publicationLoading}
            aria-label="Tutup Publikasi Salary"
            onClick={() => setPublicationOpen(false)}><X/></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {publicationLoading && <div className="grid min-h-72 place-items-center">
            <LoaderCircle className="animate-spin text-blue-600"/>
          </div>}
          {publicationError && <div role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
            {publicationError}
          </div>}
          {publication && publishedAt && <div className="overflow-x-auto pb-2">
            <section aria-label="Preview Salary Card"
              className="mx-auto flex min-h-[1123px] w-[794px] min-w-[794px] flex-col overflow-hidden border border-slate-200 bg-white text-slate-900 shadow-xl">
              <header className="bg-[#102a43] px-12 py-10 text-white">
                <div className="flex items-start justify-between gap-8">
                  <div className="max-w-[460px]">
                    <p className="text-2xl font-bold leading-tight">
                      {publicationBrand(publication)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tracking-[0.28em] text-slate-200">
                      SLIP GAJI
                    </p>
                    <p className="mt-3 text-sm font-semibold">
                      {publication.closing.closingNumber}
                    </p>
                  </div>
                </div>
                <div className="mt-8 grid grid-cols-2 gap-6 border-t border-white/20 pt-5 text-sm">
                  <p><span className="block text-xs uppercase tracking-wider text-slate-300">Periode</span>
                    <strong>{formatDocumentDate(publication.closing.periodStart)} - {formatDocumentDate(publication.closing.periodEnd)}</strong>
                  </p>
                  <p className="text-right"><span className="block text-xs uppercase tracking-wider text-slate-300">Tanggal Publish</span>
                    <strong>{formatDocumentDate(publishedAt)}</strong>
                  </p>
                </div>
              </header>

              <div className="flex-1 space-y-9 px-12 py-10">
                <section>
                  <h3 className="border-b border-slate-300 pb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                    Identitas Team
                  </h3>
                  <dl className="mt-5 grid grid-cols-2 gap-x-12 gap-y-5 text-sm">
                    <div><dt className="text-slate-500">Nama</dt>
                      <dd className="mt-1 text-base font-bold">{publication.employee.name}</dd></div>
                    <div><dt className="text-slate-500">Divisi</dt>
                      <dd className="mt-1 font-semibold">{divisionLabel[publication.employee.division] ?? publication.employee.division}</dd></div>
                    <div><dt className="text-slate-500">Hari Kerja</dt>
                      <dd className="mt-1 font-semibold">{publication.employee.workDayCount}</dd></div>
                    <div><dt className="text-slate-500">Status</dt>
                      <dd className="mt-1 font-semibold">Siap Dipublikasikan</dd></div>
                    <div className="col-span-2"><dt className="text-slate-500">Tanggal Publish</dt>
                      <dd className="mt-1 font-semibold">{formatDocumentDate(publishedAt)}, {formatPublishTime(publishedAt)}</dd></div>
                  </dl>
                </section>

                <section>
                  <h3 className="border-b border-slate-300 pb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                    Rincian Penghasilan
                  </h3>
                  <table className="mt-3 w-full border-collapse text-sm">
                    <tbody className="divide-y divide-slate-200">
                      <tr><td className="py-3">Penghasilan Sistem</td>
                        <td className="py-3 text-right font-semibold">{rupiah(publication.totals.systemIncome)}</td></tr>
                      {showRecap && publication.components.map((line) => <tr key={line.id}
                        className="text-xs text-slate-500">
                        <td className="py-2 pl-4">{line.componentName}</td>
                        <td className="py-2 text-right">{rupiah(line.amount)}</td>
                      </tr>)}
                      <tr><td className="py-3">Tambahan</td>
                        <td className="py-3 text-right font-semibold">{rupiah(publication.totals.addition)}</td></tr>
                      {showRecap && publication.additions.map((line) => <tr key={line.id}
                        className="text-xs text-slate-500">
                        <td className="py-2 pl-4">{line.category} - {line.reason}</td>
                        <td className="py-2 text-right">{rupiah(line.amount)}</td>
                      </tr>)}
                      <tr className="border-t-2 border-slate-400 font-bold">
                        <td className="py-4">TOTAL PENGHASILAN</td>
                        <td className="py-4 text-right">{rupiah(publication.totals.totalIncome)}</td>
                      </tr>
                    </tbody>
                  </table>
                </section>

                <section>
                  <h3 className="border-b border-slate-300 pb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                    Rincian Potongan
                  </h3>
                  <table className="mt-3 w-full border-collapse text-sm">
                    <tbody className="divide-y divide-slate-200">
                      <tr><td className="py-3">Potongan Kasbon</td>
                        <td className={`py-3 text-right font-semibold ${Number(publication.totals.kasbon) > 0 ? "text-rose-700" : ""}`}>
                          {rupiah(publication.totals.kasbon)}
                        </td></tr>
                      {showRecap && publication.kasbonAllocations.map((line) => <tr key={line.id}
                        className="text-xs text-slate-500">
                        <td className="py-2 pl-4">{line.kasbonSnapshot?.description || "Kasbon"}</td>
                        <td className="py-2 text-right">{rupiah(line.amount)}</td>
                      </tr>)}
                      <tr><td className="py-3">Potongan Manual</td>
                        <td className={`py-3 text-right font-semibold ${Number(publication.totals.manualDeduction) > 0 ? "text-rose-700" : ""}`}>
                          {rupiah(publication.totals.manualDeduction)}
                        </td></tr>
                      {showRecap && publication.deductions.map((line) => <tr key={line.id}
                        className="text-xs text-slate-500">
                        <td className="py-2 pl-4">{line.category} - {line.reason}</td>
                        <td className="py-2 text-right">{rupiah(line.amount)}</td>
                      </tr>)}
                      <tr className="border-t-2 border-slate-400 font-bold">
                        <td className="py-4">TOTAL POTONGAN</td>
                        <td className={`py-4 text-right ${Number(publication.totals.totalDeduction) > 0 ? "text-rose-700" : ""}`}>
                          {rupiah(publication.totals.totalDeduction)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </section>

                <section className="border-y-2 border-emerald-700 bg-emerald-50 px-8 py-7 text-center text-emerald-900">
                  <p className="text-xs font-bold tracking-[0.22em]">TOTAL DITERIMA</p>
                  <span className="sr-only">TOTAL BERSIH DITERIMA</span>
                  <p className="mt-3 break-words text-5xl font-black tracking-tight">
                    {rupiah(publication.totals.netSalary)}
                  </p>
                </section>
              </div>

              <footer className="flex items-end justify-between gap-6 border-t border-slate-200 bg-slate-50 px-12 py-6 text-xs text-slate-500">
                <div>
                  <p>Dipublikasikan:</p>
                  <p className="mt-1 font-semibold text-slate-700">{formatDocumentDate(publishedAt)}</p>
                  <p>{formatPublishTime(publishedAt)}</p>
                </div>
                <p className="text-right text-[10px]">Created by NEXTGEN System</p>
              </footer>
            </section>
          </div>}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t bg-white p-4">
          {publication && <button type="button"
            disabled={exporting != null}
            onClick={() => setShowRecap((current) => !current)}
            className={nextgenNeutralButtonClass}>
            <Eye size={16}/>{showRecap ? "Sembunyikan Rekap" : "Lihat Rekap"}
          </button>}
          {publication && <button type="button"
            disabled={exporting != null}
            onClick={() => void downloadPublication("pdf")}
            className={nextgenNeutralButtonClass}>
            {exporting === "pdf"
              ? <LoaderCircle className="animate-spin" size={16}/>
              : <FileDown size={16}/>}
            {exporting === "pdf" ? "Menyiapkan PDF..." : "Download PDF"}
          </button>}
          {publication && <button type="button"
            disabled={exporting != null}
            onClick={() => void downloadPublication("png")}
            className={nextgenNeutralButtonClass}>
            {exporting === "png"
              ? <LoaderCircle className="animate-spin" size={16}/>
              : <Download size={16}/>}
            {exporting === "png" ? "Menyiapkan PNG..." : "Download PNG"}
          </button>}
          {publication && <button type="button"
            disabled={!whatsappReady || sharingWhatsapp || exporting != null}
            title={whatsappReady
              ? "Buat tautan Salary Card dan buka WhatsApp."
              : "Nomor WhatsApp team belum tersedia atau tidak valid."}
            onClick={() => void sharePublicationToWhatsapp()}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
            {sharingWhatsapp
              ? <LoaderCircle className="animate-spin" size={16}/>
              : <MessageCircle size={16}/>}
            {sharingWhatsapp ? "Menyiapkan tautan..." : "Kirim WhatsApp"}
          </button>}
          <button type="button" disabled={publicationLoading || exporting != null}
            onClick={() => setPublicationOpen(false)}
            className={nextgenNeutralButtonClass}>Tutup</button>
        </div>
        {publication && !whatsappReady && <p
          className="border-t bg-amber-50 px-4 py-2 text-right text-xs text-amber-800">
          Nomor WhatsApp team belum tersedia atau tidak valid. Perbarui melalui Salary Setting.
        </p>}
      </ModalCard>
    </div>}

    {cancelOpen && <div
      className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/55 p-4">
      <ModalCard className="max-w-xl">
        <div className="flex items-center justify-between border-b p-5">
          <div><p className="text-sm font-semibold text-rose-700">Konfirmasi Pembatalan</p>
            <h2 className="text-xl font-bold">Batalkan Rekap</h2></div>
          <button type="button" disabled={cancelLoading}
            onClick={() => setCancelOpen(false)}><X/></button>
        </div>
        <div className="space-y-4 p-5">
          <AppCard className="grid gap-3 p-4 text-sm sm:grid-cols-2">
            <p>Nomor Closing<br/><strong>{recap.closingNumber}</strong></p>
            <p>Periode<br/><strong>{formatPeriod(recap.periodStart, recap.periodEnd)}</strong></p>
            <p>Jumlah Team<br/><strong>{recap.employees.length}</strong></p>
            <p>Total Bersih<br/><strong>{rupiah(totals.net)}</strong></p>
          </AppCard>
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Data akan kembali ke tahap review dan seluruh team wajib menyimpan Adjustment kembali.
          </p>
          <label className="block text-sm font-semibold">Alasan Pembatalan
            <textarea value={cancelReason} disabled={cancelLoading}
              onChange={(event) => setCancelReason(event.target.value)}
              className={`${nextgenControlClass} mt-1 h-24 w-full`}/>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <button type="button" disabled={cancelLoading}
            onClick={() => setCancelOpen(false)}
            className={nextgenNeutralButtonClass}>Kembali</button>
          <button type="button" disabled={cancelLoading}
            onClick={() => void cancelRecap()}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
            {cancelLoading && <LoaderCircle className="animate-spin" size={16}/>}
            {cancelLoading ? "Membatalkan..." : "Batalkan Rekap"}
          </button>
        </div>
      </ModalCard>
    </div>}
  </div>;
}
