"use client";

import { useState } from "react";
import { Download, Eye, LoaderCircle, X } from "lucide-react";
import {
  FilterCard, MetricCard, ModalCard, PageHeader, TableCard,
  nextgenButtonClass, nextgenControlClass, nextgenNeutralButtonClass,
} from "@/components/ui";
import { jakartaOperationalDate } from "@/lib/dates/jakarta-date";

type Category = { category: string; transactionCount: number; totalAmount: number };
type Detail = {
  id: string; date: string; category: string; description: string | null;
  amount: number; pic: string; referenceNumber: string;
};
const today = jakartaOperationalDate();
const money = (value: number) => new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", maximumFractionDigits: 0,
}).format(value);

export function OperationalDetailClient({ canExport }: { canExport: boolean }) {
  const [startDate, setStartDate] = useState(`${today.slice(0, 7)}-01`);
  const [endDate, setEndDate] = useState(today);
  const [result, setResult] = useState({
    summary: { totalAmount: 0, totalTransactions: 0, totalCategories: 0 },
    categories: [] as Category[],
  });
  const [details, setDetails] = useState<Detail[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailPage, setDetailPage] = useState(1);
  const [detailPages, setDetailPages] = useState(1);
  const [notice, setNotice] = useState("");

  async function show() {
    setLoading(true); setNotice("");
    try {
      const query = new URLSearchParams({ startDate, endDate });
      const response = await fetch(`/api/finance/operational-detail?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      setResult(await response.json());
    } catch { setNotice("Data rincian operasional tidak dapat dimuat."); }
    finally { setLoading(false); }
  }

  async function openDetail(category: string, page = 1) {
    setSelected(category); setDetails([]); setDetailLoading(true);
    try {
      const query = new URLSearchParams({ startDate, endDate, category, page: String(page), pageSize: "25" });
      const response = await fetch(`/api/finance/operational-detail?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const payload = await response.json();
      setDetails(payload.data);
      setDetailPage(payload.pagination.page);
      setDetailPages(Math.max(1, payload.pagination.totalPages));
    } catch { setNotice("Rincian kategori tidak dapat dimuat."); }
    finally { setDetailLoading(false); }
  }

  const exportUrl = `/api/finance/operational-detail/export?${new URLSearchParams({ startDate, endDate })}`;

  return <div className="space-y-6">
    <PageHeader eyebrow="Finance & HR" title="Rincian Operasional"
      description="Ringkasan seluruh transaksi biaya operasional manual."
      actions={canExport ? <a href={exportUrl} className={nextgenNeutralButtonClass}><Download size={17}/>Export Excel</a> : undefined}/>
    {notice && <div role="status" className="rounded-xl border bg-white px-4 py-3 text-sm">{notice}</div>}
    <FilterCard><div className="grid gap-3 md:grid-cols-3">
      <input aria-label="Tanggal Awal" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className={nextgenControlClass}/>
      <input aria-label="Tanggal Akhir" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className={nextgenControlClass}/>
      <button disabled={loading} onClick={() => void show()} className={nextgenButtonClass}>{loading && <LoaderCircle className="animate-spin" size={17}/>}Tampilkan</button>
    </div></FilterCard>
    <section className="grid gap-4 md:grid-cols-3">
      <MetricCard label="Total Nominal Operasional" value={money(result.summary.totalAmount)}/>
      <MetricCard label="Total Transaksi" value={result.summary.totalTransactions.toLocaleString("id-ID")}/>
      <MetricCard label="Total Kategori" value={result.summary.totalCategories.toLocaleString("id-ID")}/>
    </section>
    <TableCard><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm">
      <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["No","Kategori","Jumlah Transaksi","Total Nominal","Aksi"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead>
      <tbody className="divide-y">{result.categories.map((row, index) => <tr key={row.category}>
        <td className="px-4 py-3">{index + 1}</td><td className="px-4 py-3 font-semibold">{row.category}</td>
        <td className="px-4 py-3">{row.transactionCount.toLocaleString("id-ID")} transaksi</td>
        <td className="px-4 py-3 font-semibold">{money(row.totalAmount)}</td>
        <td className="px-4 py-3"><button onClick={() => void openDetail(row.category)} className={nextgenNeutralButtonClass}><Eye size={16}/>Rincian</button></td>
      </tr>)}</tbody>
    </table></div></TableCard>
    {selected && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
      <ModalCard className="max-w-5xl"><div className="flex items-center justify-between border-b p-5"><h2 className="text-xl font-bold">Rincian Transaksi Operasional — {selected}</h2><button onClick={() => { setSelected(null); setDetails([]); }}><X/></button></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50"><tr>{["Tanggal","Kategori","Keterangan","Nominal","PIC","Nomor Referensi"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead>
        <tbody className="divide-y">{detailLoading ? <tr><td colSpan={6} className="p-12 text-center"><LoaderCircle className="mx-auto animate-spin"/></td></tr> : details.map((row) => <tr key={row.id}><td className="px-4 py-3">{row.date}</td><td className="px-4 py-3">{row.category}</td><td className="px-4 py-3">{row.description || "—"}</td><td className="px-4 py-3">{money(row.amount)}</td><td className="px-4 py-3">{row.pic}</td><td className="px-4 py-3">{row.referenceNumber}</td></tr>)}</tbody></table></div>
        <div className="flex items-center justify-end gap-2 border-t p-4"><button disabled={detailPage <= 1 || detailLoading} onClick={() => void openDetail(selected, detailPage - 1)} className={nextgenNeutralButtonClass}>Sebelumnya</button><span className="text-sm">{detailPage} / {detailPages}</span><button disabled={detailPage >= detailPages || detailLoading} onClick={() => void openDetail(selected, detailPage + 1)} className={nextgenNeutralButtonClass}>Berikutnya</button></div>
      </ModalCard>
    </div>}
  </div>;
}
