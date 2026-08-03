"use client";

import { useState } from "react";
import { Download, FileDown, LoaderCircle } from "lucide-react";
import { nextgenNeutralButtonClass } from "@/components/ui";
import {
  canvasBlob,
  createPdfFromJpeg,
  downloadBlob,
  renderSalaryCardCanvas,
  salaryCardFilename,
  type SalaryCardData,
} from "./salary-recap-detail-client";

type PublicSalaryCard = SalaryCardData & { publishedAt: string };

const divisionLabel: Record<string, string> = {
  ADMIN: "Admin",
  ADMIN_OPS: "Admin Ops",
  SALES: "Sales",
  THREE_WHEEL_DRIVER: "Driver Roda Tiga",
  MOTORIST: "Motoris",
  DRIVER: "Driver",
};
const rupiah = (value: string) => new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
}).format(Number(value));
const formatDate = (value: string, timeZone = "UTC") =>
  new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(new Date(value));
const formatTime = (value: string) => `${new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Jakarta",
}).format(new Date(value)).replace(".", ":")} WIB`;

export function SalaryRecapPublicCard({ publication }: {
  publication: PublicSalaryCard;
}) {
  const [exporting, setExporting] = useState<"pdf" | "png" | null>(null);
  const [error, setError] = useState("");

  async function download(format: "pdf" | "png") {
    if (exporting) return;
    setExporting(format);
    setError("");
    try {
      await document.fonts.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const canvas = renderSalaryCardCanvas(
        publication,
        new Date(publication.publishedAt),
        true,
      );
      if (format === "png") {
        downloadBlob(await canvasBlob(canvas, "image/png"), salaryCardFilename(
          publication.employee.name,
          publication.closing.periodStart,
          publication.closing.periodEnd,
          "png",
        ));
      } else {
        const jpegBlob = await canvasBlob(canvas, "image/jpeg", 0.96);
        downloadBlob(createPdfFromJpeg(
          new Uint8Array(await jpegBlob.arrayBuffer()),
          canvas.width,
          canvas.height,
        ), salaryCardFilename(
          publication.employee.name,
          publication.closing.periodStart,
          publication.closing.periodEnd,
          "pdf",
        ));
      }
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : "Salary Card gagal diunduh.");
    } finally {
      setExporting(null);
    }
  }

  return <main className="min-h-screen bg-slate-100 px-3 py-6 sm:px-6">
    <div className="mx-auto mb-4 flex max-w-[794px] flex-wrap justify-end gap-2">
      <button type="button" disabled={exporting != null}
        onClick={() => void download("pdf")}
        className={nextgenNeutralButtonClass}>
        {exporting === "pdf"
          ? <LoaderCircle className="animate-spin" size={16}/>
          : <FileDown size={16}/>}
        {exporting === "pdf" ? "Menyiapkan PDF..." : "Download PDF"}
      </button>
      <button type="button" disabled={exporting != null}
        onClick={() => void download("png")}
        className={nextgenNeutralButtonClass}>
        {exporting === "png"
          ? <LoaderCircle className="animate-spin" size={16}/>
          : <Download size={16}/>}
        {exporting === "png" ? "Menyiapkan PNG..." : "Download PNG"}
      </button>
    </div>
    {error && <div role="alert"
      className="mx-auto mb-4 max-w-[794px] rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
      {error}
    </div>}
    <div className="overflow-x-auto pb-3">
      <article aria-label="Salary Card"
        className="mx-auto flex min-h-[1123px] w-[794px] min-w-[794px] flex-col overflow-hidden border border-slate-200 bg-white text-slate-900 shadow-xl">
        <header className="bg-[#102a43] px-12 py-10 text-white">
          <div className="flex items-start justify-between gap-8">
            <p className="max-w-[460px] text-2xl font-bold leading-tight">
              J&amp;T CARGO / {publication.identity.outletCode}
            </p>
            <div className="shrink-0 text-right">
              <p className="text-sm font-bold tracking-[0.28em] text-slate-200">SLIP GAJI</p>
              <p className="mt-3 text-sm font-semibold">{publication.closing.closingNumber}</p>
            </div>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-6 border-t border-white/20 pt-5 text-sm">
            <p><span className="block text-xs uppercase tracking-wider text-slate-300">Periode</span>
              <strong>{formatDate(publication.closing.periodStart)} - {formatDate(publication.closing.periodEnd)}</strong>
            </p>
            <p className="text-right"><span className="block text-xs uppercase tracking-wider text-slate-300">Tanggal Publish</span>
              <strong>{formatDate(publication.publishedAt, "Asia/Jakarta")}</strong>
            </p>
          </div>
        </header>

        <div className="flex-1 space-y-9 px-12 py-10">
          <section>
            <h2 className="border-b border-slate-300 pb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              Identitas Team
            </h2>
            <dl className="mt-5 grid grid-cols-2 gap-x-12 gap-y-5 text-sm">
              <div><dt className="text-slate-500">Nama</dt>
                <dd className="mt-1 text-base font-bold">{publication.employee.name}</dd></div>
              <div><dt className="text-slate-500">Divisi</dt>
                <dd className="mt-1 font-semibold">{divisionLabel[publication.employee.division] ?? publication.employee.division}</dd></div>
              <div><dt className="text-slate-500">Hari Kerja</dt>
                <dd className="mt-1 font-semibold">{publication.employee.workDayCount}</dd></div>
              <div><dt className="text-slate-500">Status</dt>
                <dd className="mt-1 font-semibold">Siap Dipublikasikan</dd></div>
            </dl>
          </section>

          <section>
            <h2 className="border-b border-slate-300 pb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              Rincian Penghasilan
            </h2>
            <table className="mt-3 w-full border-collapse text-sm"><tbody className="divide-y divide-slate-200">
              <tr><td className="py-3">Penghasilan Sistem</td><td className="py-3 text-right font-semibold">{rupiah(publication.totals.systemIncome)}</td></tr>
              {publication.components.map((line, index) => <tr key={`${line.componentName}-${index}`}
                className="text-xs text-slate-500"><td className="py-2 pl-4">{line.componentName}</td><td className="py-2 text-right">{rupiah(line.amount)}</td></tr>)}
              <tr><td className="py-3">Tambahan</td><td className="py-3 text-right font-semibold">{rupiah(publication.totals.addition)}</td></tr>
              {publication.additions.map((line, index) => <tr key={`${line.category}-${index}`}
                className="text-xs text-slate-500"><td className="py-2 pl-4">{line.category} - {line.reason}</td><td className="py-2 text-right">{rupiah(line.amount)}</td></tr>)}
              <tr className="border-t-2 border-slate-400 font-bold"><td className="py-4">TOTAL PENGHASILAN</td><td className="py-4 text-right">{rupiah(publication.totals.totalIncome)}</td></tr>
            </tbody></table>
          </section>

          <section>
            <h2 className="border-b border-slate-300 pb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              Rincian Potongan
            </h2>
            <table className="mt-3 w-full border-collapse text-sm"><tbody className="divide-y divide-slate-200">
              <tr><td className="py-3">Potongan Kasbon</td><td className="py-3 text-right font-semibold text-rose-700">{rupiah(publication.totals.kasbon)}</td></tr>
              {publication.kasbonAllocations.map((line, index) => <tr key={`kasbon-${index}`}
                className="text-xs text-slate-500"><td className="py-2 pl-4">{line.kasbonSnapshot?.description || "Kasbon"}</td><td className="py-2 text-right">{rupiah(line.amount)}</td></tr>)}
              <tr><td className="py-3">Potongan Manual</td><td className="py-3 text-right font-semibold text-rose-700">{rupiah(publication.totals.manualDeduction)}</td></tr>
              {publication.deductions.map((line, index) => <tr key={`${line.category}-${index}`}
                className="text-xs text-slate-500"><td className="py-2 pl-4">{line.category} - {line.reason}</td><td className="py-2 text-right">{rupiah(line.amount)}</td></tr>)}
              <tr className="border-t-2 border-slate-400 font-bold"><td className="py-4">TOTAL POTONGAN</td><td className="py-4 text-right text-rose-700">{rupiah(publication.totals.totalDeduction)}</td></tr>
            </tbody></table>
          </section>

          <section className="border-y-2 border-emerald-700 bg-emerald-50 px-8 py-7 text-center text-emerald-900">
            <p className="text-xs font-bold tracking-[0.22em]">TOTAL DITERIMA</p>
            <p className="mt-3 break-words text-5xl font-black tracking-tight">{rupiah(publication.totals.netSalary)}</p>
          </section>
        </div>
        <footer className="flex items-end justify-between gap-6 border-t border-slate-200 bg-slate-50 px-12 py-6 text-xs text-slate-500">
          <div><p>Dipublikasikan:</p><p className="mt-1 font-semibold text-slate-700">{formatDate(publication.publishedAt, "Asia/Jakarta")}</p><p>{formatTime(publication.publishedAt)}</p></div>
          <p className="text-right text-[10px]">Created by NEXTGEN System</p>
        </footer>
      </article>
    </div>
  </main>;
}
