"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock3, LocateFixed, LogIn, LogOut } from "lucide-react";

type Attendance = { id: string; businessDate: string; status: string; checkInAt: string | null; checkOutAt: string | null };
type TodayData = { businessDate: string; attendance: Attendance | null; location: { configured: boolean; active: boolean; radiusMeters: number | null } };
type HistoryData = { data: Attendance[] };
type Action = "clock-in" | "clock-out";

const safeErrors: Record<string, string> = {
  ATTENDANCE_LOCATION_NOT_CONFIGURED: "Lokasi absensi belum dikonfigurasi.",
  OUTSIDE_ATTENDANCE_RADIUS: "Anda berada di luar radius absensi.",
  LOCATION_ACCURACY_TOO_LOW: "Akurasi lokasi terlalu rendah. Aktifkan GPS presisi lalu coba lagi.",
  ALREADY_CLOCKED_IN: "Clock In hari ini sudah tercatat.",
  ALREADY_CLOCKED_OUT: "Clock Out hari ini sudah tercatat.",
  CLOCK_IN_REQUIRED: "Clock In wajib dilakukan terlebih dahulu.",
};

async function readJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  const body = text ? JSON.parse(text) as { success?: boolean; data?: unknown; error?: { code?: string } } : null;
  if (!response.ok || !body?.success) throw new Error(safeErrors[body?.error?.code ?? ""] ?? "Permintaan absensi gagal. Silakan coba kembali.");
  return body;
}

const time = (value: string | null) => value ? new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(value)) : "—";

export function TeamAttendanceClient({ employeeName, outletCode }: { employeeName: string; outletCode: string }) {
  const [today, setToday] = useState<TodayData | null>(null);
  const [history, setHistory] = useState<Attendance[]>([]);
  const [pendingAction, setPendingAction] = useState<Action | null>(null);
  const [loading, setLoading] = useState(false);
  const [locationStatus, setLocationStatus] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [todayResponse, historyResponse] = await Promise.all([readJson("/api/team/attendance/today"), readJson("/api/team/attendance/history")]);
      setToday(todayResponse.data as TodayData);
      setHistory((historyResponse as unknown as HistoryData).data ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Absensi gagal dimuat."); }
  }, []);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function submit(action: Action) {
    if (loading) return;
    setPendingAction(null); setLoading(true); setError(""); setLocationStatus("Mengambil lokasi…");
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 }));
      setLocationStatus(`Akurasi lokasi ±${Math.round(position.coords.accuracy)} meter`);
      await readJson(`/api/team/attendance/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, capturedAt: new Date(position.timestamp).toISOString(), idempotencyKey: crypto.randomUUID() }) });
      await load();
    } catch (cause) {
      const isLocationError = typeof cause === "object" && cause !== null && "code" in cause && "message" in cause;
      setError(isLocationError ? "Lokasi tidak dapat diambil. Periksa izin GPS browser." : cause instanceof Error ? cause.message : "Absensi gagal disimpan.");
    } finally { setLoading(false); }
  }

  return <main className="min-h-screen overflow-x-hidden bg-slate-50 p-4 pb-10">
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/team" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-blue-700"><ArrowLeft size={18}/> Kembali</Link>
      <header><p className="text-sm font-bold text-blue-600">Absensi Team</p><h1 className="mt-1 text-2xl font-extrabold text-slate-950">{employeeName}</h1><p className="text-sm text-slate-500">Outlet {outletCode}</p></header>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Business Date</p><p className="mt-1 font-bold text-slate-950">{today?.businessDate ?? "Memuat…"}</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{today?.attendance?.status ?? "BELUM ABSEN"}</span></div>
        <div className="mt-5 grid grid-cols-2 gap-3"><TimeCard label="Jam Masuk" value={time(today?.attendance?.checkInAt ?? null)} icon={<LogIn size={19}/>}/><TimeCard label="Jam Pulang" value={time(today?.attendance?.checkOutAt ?? null)} icon={<LogOut size={19}/>}/></div>
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><LocateFixed size={18} className="mt-0.5 shrink-0"/><span>{today?.location.configured && today.location.active ? `Lokasi aktif · radius ${today.location.radiusMeters} meter` : "Lokasi absensi belum dikonfigurasi."}</span></div>
        {locationStatus && <p className="mt-3 text-sm text-slate-600">{locationStatus}</p>}
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="mt-5 grid gap-3 sm:grid-cols-2"><button type="button" disabled={loading || Boolean(today?.attendance?.checkInAt) || !today?.location.active} onClick={() => setPendingAction("clock-in")} className="min-h-12 rounded-xl bg-blue-600 px-4 font-bold text-white disabled:opacity-50">Clock In</button><button type="button" disabled={loading || !today?.attendance?.checkInAt || Boolean(today?.attendance?.checkOutAt) || !today?.location.active} onClick={() => setPendingAction("clock-out")} className="min-h-12 rounded-xl bg-slate-950 px-4 font-bold text-white disabled:opacity-50">Clock Out</button></div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 font-bold text-slate-950"><Clock3 size={18}/> Riwayat Pribadi</h2><div className="mt-4 space-y-2">{history.map((row) => <div key={row.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-slate-100 p-3 text-sm"><div><p className="font-bold text-slate-900">{row.businessDate}</p><p className="text-slate-500">{time(row.checkInAt)} – {time(row.checkOutAt)}</p></div><span className="font-bold text-blue-700">{row.status}</span></div>)}{history.length === 0 && <p className="py-4 text-center text-sm text-slate-500">Belum ada riwayat absensi.</p>}</div></section>
    </div>
    {pendingAction && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"><section role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"><h2 className="text-lg font-bold text-slate-950">Konfirmasi {pendingAction === "clock-in" ? "Clock In" : "Clock Out"}</h2><p className="mt-2 text-sm leading-6 text-slate-600">Lokasi GPS hanya akan diambil saat Anda melanjutkan.</p><div className="mt-5 grid grid-cols-2 gap-3"><button type="button" className="min-h-11 rounded-xl border border-slate-200 font-bold" onClick={() => setPendingAction(null)}>Batal</button><button type="button" className="min-h-11 rounded-xl bg-blue-600 font-bold text-white" onClick={() => void submit(pendingAction)}>Lanjutkan</button></div></section></div>}
  </main>;
}

function TimeCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) { return <div className="rounded-xl border border-slate-100 p-3"><span className="text-blue-600">{icon}</span><p className="mt-2 text-xs text-slate-500">{label}</p><p className="text-lg font-extrabold text-slate-950">{value}</p></div>; }
