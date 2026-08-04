"use client";

import { useCallback, useEffect, useState } from "react";
import { LocateFixed, Pencil, RefreshCw, Save } from "lucide-react";
import { AppCard, PageHeader, nextgenButtonClass, nextgenControlClass } from "@/components/ui";
import { jakartaOperationalDate } from "@/lib/dates/jakarta-date";

type LocationData = { outlet: { code: string; name: string }; setting: { latitude: number; longitude: number; radiusMeters: number; isActive: boolean } | null };
type Row = { id: string; employeeName: string; division: string; businessDate: string; status: string; checkInAt: string | null; checkOutAt: string | null; clockInDistance: number | null; clockOutDistance: number | null; withinRadius: boolean };
type ApiBody = { success?: boolean; data?: unknown; pagination?: { total: number }; error?: { code?: string } };

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  const body = text ? JSON.parse(text) as ApiBody : null;
  if (!response.ok || !body?.success) throw new Error(body?.error?.code === "FORBIDDEN" ? "Anda tidak memiliki izin untuk tindakan ini." : "Permintaan Absensi gagal.");
  return body;
}
const time = (value: string | null) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value)) : "—";
const jakartaInput = (value: string | null) => value ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)).replace(" ", "T") : "";
const jakartaIso = (value: string) => new Date(`${value}:00+07:00`).toISOString();

export function AttendanceAdminClient({ canCorrect }: { canCorrect: boolean }) {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [locationForm, setLocationForm] = useState({ latitude: "", longitude: "", radiusMeters: "100", isActive: true });
  const [rows, setRows] = useState<Row[]>([]);
  const [businessDate, setBusinessDate] = useState(jakartaOperationalDate);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [correcting, setCorrecting] = useState<Row | null>(null);
  const [correction, setCorrection] = useState({ checkInAt: "", checkOutAt: "", status: "PRESENT", reason: "" });

  const loadLocation = useCallback(async () => {
    const response = await api("/api/hr/attendance/location");
    const data = response.data as LocationData;
    setLocation(data);
    if (data.setting) setLocationForm({ latitude: String(data.setting.latitude), longitude: String(data.setting.longitude), radiusMeters: String(data.setting.radiusMeters), isActive: data.setting.isActive });
  }, []);
  const loadRows = useCallback(async () => {
    const query = new URLSearchParams({ businessDate }); if (search.trim()) query.set("search", search.trim()); if (status) query.set("status", status);
    const response = await api(`/api/hr/attendance?${query}`); setRows(response.data as Row[]);
  }, [businessDate, search, status]);

  useEffect(() => { queueMicrotask(() => void Promise.all([loadLocation(), loadRows()]).catch((cause) => setError(cause instanceof Error ? cause.message : "Data gagal dimuat."))); }, [loadLocation, loadRows]);

  function useCurrentLocation() {
    setError("");
    navigator.geolocation.getCurrentPosition((position) => setLocationForm((current) => ({ ...current, latitude: String(position.coords.latitude), longitude: String(position.coords.longitude) })), () => setError("Lokasi browser tidak dapat diambil."), { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 });
  }
  async function saveLocation() {
    if (saving) return; setSaving(true); setError("");
    try { await api("/api/hr/attendance/location", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ latitude: Number(locationForm.latitude), longitude: Number(locationForm.longitude), radiusMeters: Number(locationForm.radiusMeters), isActive: locationForm.isActive }) }); setMessage("Lokasi absensi berhasil disimpan."); await loadLocation(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Lokasi gagal disimpan."); } finally { setSaving(false); }
  }
  function openCorrection(row: Row) {
    setCorrecting(row); setCorrection({ checkInAt: jakartaInput(row.checkInAt), checkOutAt: jakartaInput(row.checkOutAt), status: row.status, reason: "" });
  }
  async function saveCorrection() {
    if (!correcting || saving) return; setSaving(true); setError("");
    try { await api(`/api/hr/attendance/${correcting.id}/correct`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checkInAt: correction.checkInAt ? jakartaIso(correction.checkInAt) : null, checkOutAt: correction.checkOutAt ? jakartaIso(correction.checkOutAt) : null, status: correction.status, reason: correction.reason }) }); setCorrecting(null); setMessage("Koreksi absensi berhasil disimpan."); await loadRows(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Koreksi gagal disimpan."); } finally { setSaving(false); }
  }

  return <div className="space-y-6">
    <PageHeader eyebrow="Finance & HR" title="Absensi" description="Pengaturan lokasi dan monitoring absensi team per outlet." />
    {message && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700" role="status">{message}</p>}{error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
    <AppCard className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-950">Pengaturan Lokasi</h2><p className="text-sm text-slate-500">{location ? `${location.outlet.code} · ${location.outlet.name}` : "Memuat outlet…"}</p></div>{canCorrect && <button type="button" onClick={useCurrentLocation} className={`${nextgenButtonClass} border border-slate-200 bg-white text-slate-700`}><LocateFixed size={17}/> Gunakan Lokasi Saat Ini</button>}</div><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Field label="Latitude"><input disabled={!canCorrect} className={`${nextgenControlClass} w-full`} type="number" step="any" value={locationForm.latitude} onChange={(event) => setLocationForm({ ...locationForm, latitude: event.target.value })}/></Field><Field label="Longitude"><input disabled={!canCorrect} className={`${nextgenControlClass} w-full`} type="number" step="any" value={locationForm.longitude} onChange={(event) => setLocationForm({ ...locationForm, longitude: event.target.value })}/></Field><Field label="Radius Meter"><input disabled={!canCorrect} className={`${nextgenControlClass} w-full`} type="number" min="1" max="10000" value={locationForm.radiusMeters} onChange={(event) => setLocationForm({ ...locationForm, radiusMeters: event.target.value })}/></Field><Field label="Status"><label className="flex h-11 items-center gap-3"><input disabled={!canCorrect} type="checkbox" checked={locationForm.isActive} onChange={(event) => setLocationForm({ ...locationForm, isActive: event.target.checked })}/> Lokasi aktif</label></Field></div>{canCorrect && <div className="mt-4 flex justify-end"><button type="button" disabled={saving} onClick={() => void saveLocation()} className={`${nextgenButtonClass} bg-blue-600 text-white`}><Save size={17}/> {saving ? "Menyimpan…" : "Simpan Lokasi"}</button></div>}</AppCard>
    <AppCard className="overflow-hidden"><div className="border-b border-slate-200 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-950">Monitoring Absensi</h2><button type="button" onClick={() => void loadRows()} className={`${nextgenButtonClass} border border-slate-200 bg-white text-slate-700`}><RefreshCw size={17}/> Refresh</button></div><div className="mt-4 grid gap-3 md:grid-cols-3"><input type="date" className={nextgenControlClass} value={businessDate} onChange={(event) => setBusinessDate(event.target.value)}/><input className={nextgenControlClass} placeholder="Cari nama team" value={search} onChange={(event) => setSearch(event.target.value)}/><select className={nextgenControlClass} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Semua Status</option>{["PRESENT","LATE","ABSENT","LEAVE","SICK","PERMISSION"].map((value) => <option key={value}>{value}</option>)}</select></div></div><div className="overflow-x-auto"><table className="min-w-[1050px] w-full text-sm"><thead><tr className="bg-slate-50 text-left text-slate-500">{["Nama","Divisi","Tanggal","Status","Jam Masuk","Jam Pulang","Jarak Masuk","Jarak Pulang","Lokasi","Aksi"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-100"><td className="px-4 py-3 font-bold">{row.employeeName}</td><td className="px-4">{row.division}</td><td className="px-4">{row.businessDate}</td><td className="px-4">{row.status}</td><td className="px-4">{time(row.checkInAt)}</td><td className="px-4">{time(row.checkOutAt)}</td><td className="px-4">{row.clockInDistance == null ? "—" : `${Math.round(row.clockInDistance)} m`}</td><td className="px-4">{row.clockOutDistance == null ? "—" : `${Math.round(row.clockOutDistance)} m`}</td><td className="px-4">{row.withinRadius ? "Dalam radius" : "Belum lengkap"}</td><td className="px-4">{canCorrect ? <button type="button" onClick={() => openCorrection(row)} className="grid size-11 place-items-center rounded-xl text-blue-700 hover:bg-blue-50" aria-label={`Koreksi ${row.employeeName}`}><Pencil size={17}/></button> : "—"}</td></tr>)}</tbody></table>{rows.length === 0 && <p className="p-8 text-center text-sm text-slate-500">Belum ada absensi pada filter ini.</p>}</div></AppCard>
    {correcting && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"><section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl"><h2 className="text-lg font-bold text-slate-950">Koreksi Absensi — {correcting.employeeName}</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Jam Masuk"><input type="datetime-local" className={`${nextgenControlClass} w-full`} value={correction.checkInAt} onChange={(event) => setCorrection({ ...correction, checkInAt: event.target.value })}/></Field><Field label="Jam Pulang"><input type="datetime-local" className={`${nextgenControlClass} w-full`} value={correction.checkOutAt} onChange={(event) => setCorrection({ ...correction, checkOutAt: event.target.value })}/></Field><Field label="Status"><select className={`${nextgenControlClass} w-full`} value={correction.status} onChange={(event) => setCorrection({ ...correction, status: event.target.value })}>{["PRESENT","LATE","ABSENT","LEAVE","SICK","PERMISSION"].map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Alasan"><textarea className="min-h-24 w-full rounded-xl border border-slate-200 p-3 text-sm" value={correction.reason} onChange={(event) => setCorrection({ ...correction, reason: event.target.value })}/></Field></div><div className="mt-5 flex justify-end gap-2"><button type="button" className={`${nextgenButtonClass} border border-slate-200 bg-white text-slate-700`} onClick={() => setCorrecting(null)}>Batal</button><button type="button" disabled={saving || correction.reason.trim().length < 10} className={`${nextgenButtonClass} bg-blue-600 text-white`} onClick={() => void saveCorrection()}>Simpan Koreksi</button></div></section></div>}
  </div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="text-sm font-semibold text-slate-700"><span className="mb-1.5 block">{label}</span>{children}</label>; }
