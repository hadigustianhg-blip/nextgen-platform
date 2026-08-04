"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Clock3, LocateFixed, LogIn, LogOut } from "lucide-react";

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

  return <div className="space-y-5 overflow-x-hidden">
      <header><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-600">Aktivitas Team</p><h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-950">Absensi</h1><p className="mt-1 text-sm font-semibold text-slate-500">{employeeName} · Outlet {outletCode}</p></header>
      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_35px_rgba(15,23,42,0.06)]">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Business Date</p><p className="mt-1 font-extrabold text-slate-950">{today?.businessDate ?? "Memuat…"}</p></div><span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">{today?.attendance?.status ?? "BELUM ABSEN"}</span></div>
        <div className="relative mt-5 grid grid-cols-2 gap-3 before:absolute before:left-1/2 before:top-5 before:h-px before:w-5 before:-translate-x-1/2 before:bg-slate-200"><TimeCard label="Jam Masuk" value={time(today?.attendance?.checkInAt ?? null)} icon={<LogIn size={19}/>}/><TimeCard label="Jam Pulang" value={time(today?.attendance?.checkOutAt ?? null)} icon={<LogOut size={19}/>}/></div>
        <div className="mt-4 flex items-start gap-2 rounded-2xl bg-slate-50 p-3 text-sm leading-6 text-slate-600"><LocateFixed size={18} className="mt-0.5 shrink-0"/><span>{today?.location.configured && today.location.active ? `Lokasi aktif · radius ${today.location.radiusMeters} meter` : "Lokasi absensi belum dikonfigurasi. Hubungi Admin untuk mengatur lokasi absensi."}</span></div>
        {locationStatus && <p className="mt-3 text-sm text-slate-600">{locationStatus}</p>}
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3"><button type="button" disabled={loading || Boolean(today?.attendance?.checkInAt) || !today?.location.active} onClick={() => setPendingAction("clock-in")} className="min-h-12 rounded-2xl bg-blue-600 px-3 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-50">Clock In</button><button type="button" disabled={loading || !today?.attendance?.checkInAt || Boolean(today?.attendance?.checkOutAt) || !today?.location.active} onClick={() => setPendingAction("clock-out")} className="min-h-12 rounded-2xl bg-slate-950 px-3 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-50">Clock Out</button></div>
      </section>
      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_35px_rgba(15,23,42,0.06)]"><h2 className="flex items-center gap-2 font-extrabold text-slate-950"><CalendarDays size={19} className="text-blue-600"/> Riwayat Pribadi</h2><div className="mt-4 space-y-2.5">{history.map((row) => <div key={row.id} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-sm"><div><p className="font-extrabold text-slate-900">{row.businessDate}</p><p className="mt-1 flex items-center gap-1.5 text-slate-500"><Clock3 size={14}/>{time(row.checkInAt)} – {time(row.checkOutAt)}</p></div><span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-blue-700 shadow-sm">{row.status}</span></div>)}{history.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Belum ada riwayat absensi.</p>}</div></section>
    {pendingAction && <div className="fixed inset-0 z-[70] flex items-end bg-slate-950/50 p-3 sm:items-center sm:justify-center"><section role="dialog" aria-modal="true" className="w-full max-w-sm rounded-[24px] bg-white p-5 shadow-xl"><h2 className="text-lg font-bold text-slate-950">Konfirmasi {pendingAction === "clock-in" ? "Clock In" : "Clock Out"}</h2><p className="mt-2 text-sm leading-6 text-slate-600">Lokasi GPS hanya akan diambil saat Anda melanjutkan.</p><div className="mt-5 grid grid-cols-2 gap-3"><button type="button" className="min-h-11 rounded-xl border border-slate-200 font-bold" onClick={() => setPendingAction(null)}>Batal</button><button type="button" className="min-h-11 rounded-xl bg-blue-600 font-bold text-white" onClick={() => void submit(pendingAction)}>Lanjutkan</button></div></section></div>}
  </div>;
}

function TimeCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) { return <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3"><span className="text-blue-600">{icon}</span><p className="mt-2 text-xs text-slate-500">{label}</p><p className="text-lg font-extrabold text-slate-950">{value}</p></div>; }
