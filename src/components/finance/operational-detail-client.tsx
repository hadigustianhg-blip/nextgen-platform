"use client";

import { useRef, useState } from "react";
import {
  Check, ChevronDown, ChevronRight, ChevronUp, Download, LoaderCircle,
} from "lucide-react";
import {
  AppCard, FilterCard, MetricCard, PageHeader, SectionCard, TableCard,
  nextgenButtonClass, nextgenControlClass, nextgenNeutralButtonClass,
} from "@/components/ui";
import { jakartaOperationalDate } from "@/lib/dates/jakarta-date";
import { downloadFile } from "@/lib/files/download-file";
import {
  groupCashAdvanceDetails, isCashAdvanceCategory, OperationalDetailRow,
  sortOperationalDetails,
} from "./operational-detail.view";

type Category = { category: string; transactionCount: number; totalAmount: number };
type SummaryResult = {
  summary: { totalAmount: number; totalTransactions: number; totalCategories: number };
  categories: Category[];
};

const today = jakartaOperationalDate();
const initialResult: SummaryResult = {
  summary: { totalAmount: 0, totalTransactions: 0, totalCategories: 0 },
  categories: [],
};
const money = (value: number) => new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", maximumFractionDigits: 0,
}).format(value);
const displayDate = (value: string) => new Intl.DateTimeFormat("id-ID", {
  day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
}).format(new Date(`${value}T00:00:00.000Z`));
function validRange(startDate: string, endDate: string) {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  return Boolean(startDate && endDate && Number.isFinite(start) && Number.isFinite(end)
    && start <= end && (end - start) / 86_400_000 <= 30);
}

export function OperationalDetailClient({ canExport }: { canExport: boolean }) {
  const [startDate, setStartDate] = useState(`${today.slice(0, 7)}-01`);
  const [endDate, setEndDate] = useState(today);
  const [result, setResult] = useState<SummaryResult>(initialResult);
  const [details, setDetails] = useState<OperationalDetailRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const [detailError, setDetailError] = useState("");
  const [exportError, setExportError] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const detailCache = useRef(new Map<string, OperationalDetailRow[]>());
  const inFlight = useRef(new Set<string>());
  const requestVersion = useRef(0);
  const activeDetailKey = useRef("");

  async function loadDetail(
    category: string,
    range = { startDate, endDate },
    force = false,
  ) {
    setSelected(category);
    setDetailError("");
    const cacheKey = `${range.startDate}|${range.endDate}|${category}`;
    activeDetailKey.current = cacheKey;
    const cached = detailCache.current.get(cacheKey);
    if (cached && !force) {
      setDetailLoading(false);
      setDetails(cached);
      const firstGroup = isCashAdvanceCategory(category)
        ? groupCashAdvanceDetails(cached)[0]?.key
        : undefined;
      setOpenGroups(firstGroup ? new Set([firstGroup]) : new Set());
      return;
    }
    if (inFlight.current.has(cacheKey)) return;

    const version = requestVersion.current;
    inFlight.current.add(cacheKey);
    setDetails([]);
    setDetailLoading(true);
    try {
      const firstQuery = new URLSearchParams({
        ...range, category, page: "1", pageSize: "100",
      });
      const firstResponse = await fetch(
        `/api/finance/operational-detail?${firstQuery}`,
        { cache: "no-store" },
      );
      if (!firstResponse.ok) throw new Error();
      const firstPayload = await firstResponse.json();
      const pages = Number(firstPayload.pagination?.totalPages || 1);
      const remaining = await Promise.all(
        Array.from({ length: Math.max(0, pages - 1) }, async (_, index) => {
          const query = new URLSearchParams({
            ...range, category, page: String(index + 2), pageSize: "100",
          });
          const response = await fetch(
            `/api/finance/operational-detail?${query}`,
            { cache: "no-store" },
          );
          if (!response.ok) throw new Error();
          return response.json();
        }),
      );
      const rows = sortOperationalDetails([
        ...firstPayload.data,
        ...remaining.flatMap((payload) => payload.data),
      ]);
      detailCache.current.set(cacheKey, rows);
      if (version === requestVersion.current && activeDetailKey.current === cacheKey) {
        setDetails(rows);
        const firstGroup = isCashAdvanceCategory(category)
          ? groupCashAdvanceDetails(rows)[0]?.key
          : undefined;
        setOpenGroups(firstGroup ? new Set([firstGroup]) : new Set());
      }
    } catch {
      if (version === requestVersion.current && activeDetailKey.current === cacheKey) {
        setDetails([]);
        setDetailError("Rincian kategori tidak dapat dimuat.");
      }
    } finally {
      inFlight.current.delete(cacheKey);
      if (version === requestVersion.current && activeDetailKey.current === cacheKey) {
        setDetailLoading(false);
      }
    }
  }

  async function show() {
    if (!validRange(startDate, endDate)) {
      setNotice("Rentang tanggal tidak valid.");
      return;
    }
    setLoading(true);
    setNotice("");
    setDetailError("");
    setSelected(null);
    setDetails([]);
    setOpenGroups(new Set());
    detailCache.current.clear();
    inFlight.current.clear();
    requestVersion.current += 1;
    activeDetailKey.current = "";
    try {
      const query = new URLSearchParams({ startDate, endDate });
      const response = await fetch(
        `/api/finance/operational-detail?${query}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error();
      const payload: SummaryResult = await response.json();
      setResult(payload);
      const firstCategory = payload.categories[0]?.category;
      if (firstCategory) await loadDetail(firstCategory, { startDate, endDate });
    } catch {
      setResult(initialResult);
      setNotice("Data rincian operasional tidak dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }

  const exportUrl = `/api/finance/operational-detail/export?${new URLSearchParams({
    startDate, endDate,
  })}`;
  async function exportExcel() {
    if (exporting) return;
    setExporting(true);
    setExportError("");
    try {
      await downloadFile(exportUrl);
    } catch {
      setExportError("Export gagal. Silakan coba kembali.");
    } finally {
      setExporting(false);
    }
  }

  const activeCategory = result.categories.find((row) => row.category === selected);
  const cashAdvanceGroups = isCashAdvanceCategory(selected)
    ? groupCashAdvanceDetails(details)
    : [];

  function toggleGroup(key: string) {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return <div className="space-y-6">
    {exportError && <div role="alert" className="fixed right-5 top-5 z-[70] rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-lg">
      {exportError}
    </div>}
    <PageHeader eyebrow="Finance & HR" title="Rincian Operasional"
      description="Ringkasan seluruh transaksi biaya operasional manual."
      actions={canExport ? <button type="button" disabled={exporting}
        onClick={() => void exportExcel()} className={nextgenNeutralButtonClass}>
        {exporting ? <LoaderCircle className="animate-spin" size={17}/> : <Download size={17}/>}
        {exporting ? "Mengekspor..." : "Export Excel"}
      </button> : undefined}/>
    {notice && <div role="status" className="rounded-xl border bg-white px-4 py-3 text-sm">{notice}</div>}
    <FilterCard><div className="grid gap-3 md:grid-cols-3">
      <input aria-label="Tanggal Awal" type="date" value={startDate}
        onChange={(event) => setStartDate(event.target.value)} className={nextgenControlClass}/>
      <input aria-label="Tanggal Akhir" type="date" value={endDate}
        onChange={(event) => setEndDate(event.target.value)} className={nextgenControlClass}/>
      <button disabled={loading} onClick={() => void show()} className={nextgenButtonClass}>
        {loading && <LoaderCircle className="animate-spin" size={17}/>}Tampilkan
      </button>
    </div></FilterCard>
    <section className="grid gap-4 md:grid-cols-3">
      <MetricCard label="Total Nominal Operasional" value={money(result.summary.totalAmount)}/>
      <MetricCard label="Total Transaksi" value={result.summary.totalTransactions.toLocaleString("id-ID")}/>
      <MetricCard label="Total Kategori" value={result.summary.totalCategories.toLocaleString("id-ID")}/>
    </section>

    <section data-testid="operational-master-detail"
      className="grid items-start gap-5 md:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)] lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
      <TableCard>
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-950">Ringkasan Kategori</h2>
        </div>
        {result.categories.length ? <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>{["No", "Kategori", "Jumlah Transaksi", "Total Nominal"].map((label) =>
                <th key={label} className="px-4 py-3">{label}</th>)}
                <th className="w-12 px-4 py-3"><span className="sr-only">Pilih</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {result.categories.map((row, index) => {
                const active = selected === row.category;
                return <tr key={row.category} role="button" tabIndex={0}
                  aria-current={active ? "true" : undefined}
                  onClick={() => void loadDetail(row.category)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      void loadDetail(row.category);
                    }
                  }}
                  className={`cursor-pointer border-l-4 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${
                    active ? "border-l-blue-600 bg-blue-50/80" : "border-l-transparent"
                  }`}>
                  <td className="px-4 py-3">{index + 1}</td>
                  <td className="px-4 py-3 font-semibold">
                    <span className="flex items-center gap-2">
                      {active && <Check size={15} className="text-blue-700"/>}{row.category}
                    </span>
                  </td>
                  <td className="px-4 py-3">{row.transactionCount.toLocaleString("id-ID")} transaksi</td>
                  <td className="px-4 py-3 font-semibold">{money(row.totalAmount)}</td>
                  <td className="px-4 py-3 text-right text-slate-400">
                    {active ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </div> : <div className="px-5 py-14 text-center text-sm text-slate-500">
          Belum ada data kategori pada rentang ini.
        </div>}
      </TableCard>

      <SectionCard title={selected ? `Rincian ${selected}` : "Rincian Kategori"}
        className="min-h-80 md:sticky md:top-24">
        {activeCategory && <div className="mb-4 grid grid-cols-2 gap-3">
          <AppCard className="rounded-xl p-3 shadow-none">
            <p className="text-xs text-slate-500">Total Nominal</p>
            <p className="mt-1 font-bold text-slate-950">{money(activeCategory.totalAmount)}</p>
          </AppCard>
          <AppCard className="rounded-xl p-3 shadow-none">
            <p className="text-xs text-slate-500">Jumlah Transaksi</p>
            <p className="mt-1 font-bold text-slate-950">{activeCategory.transactionCount.toLocaleString("id-ID")} transaksi</p>
          </AppCard>
        </div>}

        {detailLoading ? <div data-testid="detail-loading" className="grid min-h-48 place-items-center">
          <LoaderCircle className="animate-spin text-blue-700" size={28}/>
        </div> : detailError ? <div className="grid min-h-48 place-items-center text-center">
          <div><p className="text-sm text-slate-600">{detailError}</p>
            {selected && <button type="button" onClick={() => void loadDetail(selected, undefined, true)}
              className={`${nextgenNeutralButtonClass} mt-3`}>Coba Lagi</button>}
          </div>
        </div> : !selected ? <div className="grid min-h-48 place-items-center text-center text-sm text-slate-500">
          Belum ada kategori yang dipilih.
        </div> : details.length === 0 ? <div className="grid min-h-48 place-items-center text-center text-sm text-slate-500">
          Tidak ada rincian transaksi.
        </div> : isCashAdvanceCategory(selected)
          ? <div className="space-y-3">{cashAdvanceGroups.map((group) => {
            const expanded = openGroups.has(group.key);
            return <div key={group.key} className="overflow-hidden rounded-xl border border-slate-200">
              <button type="button" aria-expanded={expanded}
                onClick={() => toggleGroup(group.key)}
                className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-slate-50">
                <span><span className="block font-semibold text-slate-950">{group.name}</span>
                  <span className="text-xs text-slate-500">{group.transactionCount} transaksi</span></span>
                <span className="flex items-center gap-2 font-semibold">
                  {money(group.totalAmount)}
                  {expanded ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
                </span>
              </button>
              {expanded && <div className="divide-y border-t border-slate-200 bg-slate-50/60">
                {group.transactions.map((row) => <DetailItem key={row.id} row={row} compact/>)}
              </div>}
            </div>;
          })}</div>
          : <div className="divide-y rounded-xl border border-slate-200">
            {sortOperationalDetails(details).map((row) => <DetailItem key={row.id} row={row}/>)}
          </div>}
      </SectionCard>
    </section>
  </div>;
}

function DetailItem({ row, compact = false }: {
  row: OperationalDetailRow;
  compact?: boolean;
}) {
  return <article className="space-y-2 p-3">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-sm font-semibold text-slate-950">{displayDate(row.date)}</p>
        <p className="mt-1 text-sm text-slate-600">{row.description || "Tanpa keterangan"}</p></div>
      <p className="shrink-0 text-sm font-bold text-slate-950">{money(row.amount)}</p>
    </div>
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
      {!compact && row.pic && <span>PIC: {row.pic}</span>}
      {row.referenceNumber && <span>Referensi: {row.referenceNumber}</span>}
    </div>
  </article>;
}
