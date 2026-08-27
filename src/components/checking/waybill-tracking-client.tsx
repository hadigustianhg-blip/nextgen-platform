"use client";

import { FormEvent, useMemo, useState } from "react";
import { Eye, LoaderCircle, MapPin, MessageCircle, PackageSearch, Route, Search } from "lucide-react";
import { buildTrackingWhatsAppUrl, type WaybillTrackingResult } from "@/modules/checking";

const WAYBILL_PATTERN = /^[A-Za-z0-9]{1,100}$/;

export function deriveTrackingRoute(timeline: WaybillTrackingResult["timeline"]) {
  return timeline.reduce<string[]>((locations, event) => {
    const location = event.scanNetworkName.trim();
    if (location && locations.at(-1) !== location) locations.push(location);
    return locations;
  }, []);
}

export function newestTrackingEvents(timeline: WaybillTrackingResult["timeline"]) {
  return [...timeline].reverse();
}

export function formatTrackingTimestamp(value: string) {
  if (!value.trim()) return "-";
  const businessValue = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(value) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}+07:00`
    : value;
  const date = new Date(businessValue);
  if (Number.isNaN(date.getTime())) return value;
  return `${new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    hourCycle: "h23", timeZone: "Asia/Jakarta",
  }).format(date).replace("pukul", "·")} WIB`;
}

export function WaybillTrackingClient({ canRevealSensitive = false }: { canRevealSensitive?: boolean }) {
  const [waybillNo, setWaybillNo] = useState("");
  const [result, setResult] = useState<WaybillTrackingResult | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "not-found" | "error">("idle");
  const [validation, setValidation] = useState("");
  const [revealedPhone, setRevealedPhone] = useState<string | null>(null);
  const [revealState, setRevealState] = useState<"idle" | "loading" | "error" | "forbidden" | "not-found">("idle");
  const route = useMemo(() => result ? deriveTrackingRoute(result.timeline) : [], [result]);
  const timeline = useMemo(() => result ? newestTrackingEvents(result.timeline) : [], [result]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "loading") return;
    const normalized = waybillNo.trim();
    if (!WAYBILL_PATTERN.test(normalized)) {
      setValidation("Masukkan satu nomor resi yang valid.");
      return;
    }
    setValidation("");
    setResult(null);
    setRevealedPhone(null);
    setRevealState("idle");
    setState("loading");
    try {
      const response = await fetch("/api/checking/waybill-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waybillNo: normalized }),
      });
      if (response.status === 404) return setState("not-found");
      if (!response.ok) return setState("error");
      const payload = await response.json() as { data: WaybillTrackingResult };
      setResult(payload.data);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  const latestStatus = result?.latest.status || result?.latest.scanTypeName || "-";
  const latestTime = result?.latest.scanTime || result?.latest.uploadTime || "";

  async function revealPhone() {
    if (!result || revealState === "loading") return;
    setRevealState("loading");
    try {
      const response = await fetch("/api/checking/waybill-tracking/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waybillNo: result.waybillNo }),
      });
      if (response.status === 403) return setRevealState("forbidden");
      if (response.status === 404) return setRevealState("not-found");
      if (!response.ok) return setRevealState("error");
      const payload = await response.json() as { data: { waybillNo: string; receiverPhone: string } };
      setRevealedPhone(payload.data.receiverPhone);
      setRevealState("idle");
    } catch {
      setRevealState("error");
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-600">Pengecekan</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Tracking Resi</h1>
        <p className="mt-2 text-sm text-slate-500">Lacak perjalanan dan status terbaru resi J&amp;T Cargo secara real-time.</p>
      </header>

      <form onSubmit={submit} className="rounded-[var(--nextgen-radius-panel)] border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
        <label htmlFor="waybillNo" className="text-sm font-semibold text-slate-800">Nomor Resi</label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input id="waybillNo" value={waybillNo} disabled={state === "loading"}
            onChange={(event) => setWaybillNo(event.target.value)} placeholder="Masukkan nomor resi" autoComplete="off"
            className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50" />
          <button type="submit" disabled={state === "loading"}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 text-sm font-semibold text-white shadow-md shadow-blue-900/15 transition hover:brightness-105 disabled:cursor-wait disabled:opacity-70">
            <Search size={17} />{state === "loading" ? "Mengecek..." : "Cek Tracking"}
          </button>
        </div>
        {validation && <p className="mt-2 text-sm font-medium text-red-600">{validation}</p>}
      </form>

      {state === "loading" && <StateCard title="Mengecek perjalanan resi..." />}
      {state === "not-found" && <StateCard title="Resi tidak ditemukan." detail="Periksa kembali nomor resi yang dimasukkan." />}
      {state === "error" && <StateCard title="Tracking belum dapat diperiksa." detail="Silakan coba beberapa saat lagi." />}
      {!result && state === "idle" && <StateCard title="Masukkan nomor resi untuk melihat perjalanan paket." />}

      {result && <>
        <ShipmentDetail result={result} canRevealSensitive={canRevealSensitive} revealedPhone={revealedPhone}
          revealState={revealState} onReveal={() => void revealPhone()} />
        <section className="rounded-[var(--nextgen-radius-panel)] border border-blue-100 bg-gradient-to-br from-white to-blue-50/60 p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Summary label="Nomor Resi" value={result.waybillNo} />
            <Summary label="Status Terakhir" value={latestStatus} />
            <Summary label="Lokasi Terakhir" value={result.latest.scanNetworkName || "-"} />
            <Summary label="Waktu Scan Terakhir" value={formatTrackingTimestamp(latestTime)} />
            <Summary label="Tujuan Berikutnya" value={result.latest.nextStopName || "-"} />
          </div>
        </section>

        {route.length >= 2 && <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Route size={17} className="text-blue-600" />Rute Perjalanan</div>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{route.join(" → ")}</p>
        </section>}

        <section className="rounded-[var(--nextgen-radius-panel)] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Riwayat Perjalanan</h2>
          <div className="mt-5 space-y-0">
            {timeline.map((event, index) => <article key={`${event.scanTime}-${event.taskCode}-${index}`} className="relative flex gap-4 pb-6 last:pb-0">
              {index < timeline.length - 1 && <span aria-hidden className="absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px bg-blue-100" />}
              <span className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600 ring-4 ring-white"><MapPin size={15} /></span>
              <div className="min-w-0 flex-1 rounded-2xl bg-slate-50 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <p className="font-semibold text-slate-900">{event.scanTypeName || event.status || "Pembaruan perjalanan"}</p>
                  {(event.scanTime || event.uploadTime) && <time className="text-xs font-medium text-slate-500">{formatTrackingTimestamp(event.scanTime || event.uploadTime)}</time>}
                </div>
                {event.scanNetworkName && <p className="mt-1 text-sm font-medium text-blue-700">{event.scanNetworkName}</p>}
                {event.status && event.status !== event.scanTypeName && <p className="mt-2 text-sm text-slate-600">{event.status}</p>}
                {event.description && <p className="mt-2 text-sm leading-6 text-slate-600">{event.description}</p>}
                {event.nextStopName && <p className="mt-2 text-xs font-medium text-slate-500">Tujuan berikutnya: {event.nextStopName}</p>}
                {(event.scanMode || event.taskCode) && <p className="mt-1 text-xs text-slate-400">{[event.scanMode, event.taskCode].filter(Boolean).join(" · ")}</p>}
              </div>
            </article>)}
          </div>
        </section>
      </>}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-900">{value}</p></div>;
}

function ShipmentDetail({ result, canRevealSensitive, revealedPhone, revealState, onReveal }: {
  result: WaybillTrackingResult;
  canRevealSensitive: boolean;
  revealedPhone: string | null;
  revealState: "idle" | "loading" | "error" | "forbidden" | "not-found";
  onReveal: () => void;
}) {
  if (!result.detail) {
    return <section className="rounded-[var(--nextgen-radius-panel)] border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-950">Ringkasan Kiriman</h2>
      <p className="mt-3 text-sm text-slate-500">Rincian kiriman belum tersedia.</p>
    </section>;
  }
  const detail = result.detail;
  return <div className="space-y-4">
    <section className="rounded-[var(--nextgen-radius-panel)] border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-950">Ringkasan Kiriman</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Summary label="Nomor Resi" value={detail.waybillNo} />
        <OptionalSummary label="Customer" value={detail.customerName} />
        <OptionalSummary label="Nama Barang" value={detail.goods.name} />
        <Summary label="Jumlah Koli" value={String(detail.goods.packageNumber)} />
        <Summary label="COD" value={new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(detail.codMoney)} />
      </div>
    </section>
    <section>
      <h2 className="text-lg font-bold text-slate-950">Informasi Pengirim &amp; Penerima</h2>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <PartyCard title="Pengirim" fields={[["Nama", detail.sender.name], ["Kota Asal", detail.sender.city]]} />
        <ReceiverCard name={detail.receiver.name} maskedPhone={detail.receiver.mobileMasked} address={detail.receiver.address}
          canRevealSensitive={canRevealSensitive} revealedPhone={revealedPhone} revealState={revealState} onReveal={onReveal} />
      </div>
    </section>
  </div>;
}

function OptionalSummary({ label, value }: { label: string; value: string }) {
  return value ? <Summary label={label} value={value} /> : null;
}

function PartyCard({ title, fields }: { title: string; fields: Array<[string, string]> }) {
  const visible = fields.filter(([, value]) => value);
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-blue-700">{title}</h3>
    <dl className="mt-4 space-y-3">{visible.map(([label, value]) => <div key={label}>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-slate-800">{value}</dd>
    </div>)}</dl>
  </article>;
}

function ReceiverCard({ name, maskedPhone, address, canRevealSensitive, revealedPhone, revealState, onReveal }: {
  name: string; maskedPhone: string; address: string; canRevealSensitive: boolean; revealedPhone: string | null;
  revealState: "idle" | "loading" | "error" | "forbidden" | "not-found"; onReveal: () => void;
}) {
  const whatsappUrl = buildTrackingWhatsAppUrl(revealedPhone);
  const errorMessage = revealState === "forbidden"
    ? "Anda tidak memiliki akses untuk melihat nomor penerima."
    : revealState === "not-found"
      ? "Nomor penerima tidak tersedia."
      : revealState === "error"
        ? "Nomor penerima belum dapat ditampilkan."
        : "";
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-blue-700">Penerima</h3>
    <dl className="mt-4 space-y-3">
      {name && <div><dt className="text-xs font-medium text-slate-500">Nama</dt><dd className="mt-1 text-sm font-medium text-slate-800">{name}</dd></div>}
      {(revealedPhone || maskedPhone) && <div>
        <dt className="text-xs font-medium text-slate-500">Nomor Telepon</dt>
        <dd className="mt-1 text-sm font-medium text-slate-800">{revealedPhone || maskedPhone}</dd>
        <div className="mt-2 flex flex-wrap gap-2">
          {!revealedPhone && canRevealSensitive && <button type="button" onClick={onReveal} disabled={revealState === "loading"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 disabled:cursor-wait disabled:opacity-60">
            {revealState === "loading" ? <LoaderCircle size={14} className="animate-spin" /> : <Eye size={14} />}
            {revealState === "loading" ? "Memuat nomor..." : "Tampilkan Nomor"}
          </button>}
          {revealedPhone && whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">
            <MessageCircle size={14} />WhatsApp
          </a>}
        </div>
        {revealedPhone && !whatsappUrl && <p className="mt-2 text-xs font-medium text-red-600">Nomor WhatsApp tidak valid.</p>}
        {errorMessage && <p className="mt-2 text-xs font-medium text-red-600">{errorMessage}</p>}
      </div>}
      {address && <div><dt className="text-xs font-medium text-slate-500">Alamat</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-slate-800">{address}</dd></div>}
    </dl>
  </article>;
}

function StateCard({ title, detail }: { title: string; detail?: string }) {
  return <div className="grid min-h-48 place-items-center rounded-[var(--nextgen-radius-panel)] border border-dashed border-slate-200 bg-white p-6 text-center">
    <div><PackageSearch className="mx-auto size-9 text-blue-400" /><p className="mt-3 font-semibold text-slate-800">{title}</p>{detail && <p className="mt-1 text-sm text-slate-500">{detail}</p>}</div>
  </div>;
}
