"use client";

import { useState } from "react";
import { CheckCircle2, Cloud, Database, Eye, EyeOff, Globe2, Link2, LockKeyhole, RefreshCw, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { buttonClass, inputClass, SettingsCard } from "./settings-shell";
import { SettingsOwnerControl } from "./settings-owner-control";

type DatasetStatus = "SUCCESS" | "FAILED" | "RUNNING" | "NEVER_SYNCED" | "STALE" | "UNAVAILABLE";
type DatasetView = { key: string; label: string; status: DatasetStatus; lastSyncedAt: string | null; resultSummary: string; recordCount: number | null; errorCode: string | null; detailAvailable: boolean };
type ActivityView = { id: string; occurredAt: string; integration: string; activity: string; status: "SUCCESS" | "FAILED" | "RUNNING" | "INFO"; summary: string };

export type JfsConnectionState = {
  available?: boolean;
  connected?: boolean;
  outletCode: string;
  networkCode?: string | null;
  status: string;
  accountMasked?: string | null;
  lastConnectedAt?: string | null;
  lastTestedAt?: string | null;
};

export type IntegrationData = {
  summary?: { jfsConnectionStatus: string; middlewareStatus: "ONLINE" | "OFFLINE" | "NOT_CONFIGURED"; databaseStatus: "CONNECTED" | "DEGRADED"; applicationDomain: string | null };
  connection?: JfsConnectionState;
  datasets?: DatasetView[];
  infrastructure?: { middlewareHostMasked: string | null; middlewareStatus: string; databaseStatus: string; applicationDomain: string | null; salaryCardStatus: string; cron: { key: string; lastRunAt: string | null }[]; lastSuccessfulSync: string | null; lastFailedSync: string | null };
  activities?: ActivityView[];
};

const statusLabel: Record<DatasetStatus, string> = { SUCCESS: "Berhasil", FAILED: "Gagal", RUNNING: "Sedang Berjalan", NEVER_SYNCED: "Belum Pernah Sinkron", STALE: "Perlu Diperbarui", UNAVAILABLE: "Belum tersedia" };
const statusTone: Record<DatasetStatus, string> = { SUCCESS: "bg-emerald-50 text-emerald-700", FAILED: "bg-red-50 text-red-700", RUNNING: "bg-blue-50 text-blue-700", NEVER_SYNCED: "bg-slate-100 text-slate-600", STALE: "bg-amber-50 text-amber-700", UNAVAILABLE: "bg-slate-100 text-slate-500" };

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value));
}

export function IntegrationStatusCard({ icon, title, value, subtitle, tone = "slate" }: { icon: React.ReactNode; title: string; value: string; subtitle?: string; tone?: "slate" | "green" | "red" | "amber" }) {
  const colors = { slate: "bg-slate-100 text-slate-600", green: "bg-emerald-50 text-emerald-700", red: "bg-red-50 text-red-700", amber: "bg-amber-50 text-amber-700" };
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className={`grid size-10 place-items-center rounded-xl ${colors[tone]}`}>{icon}</div><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p><p className="mt-1 text-xl font-extrabold text-slate-950">{value}</p>{subtitle && <p className="mt-2 text-sm leading-5 text-slate-500">{subtitle}</p>}</article>;
}

function ComingSoonButton({ children }: { children: React.ReactNode }) { return <button className={buttonClass} disabled title="Fitur akan aktif setelah dataset sinkronisasi otomatis berjalan.">{children}</button>; }

export function JfsConnectionCard({ data }: { data: JfsConnectionState }) {
  const [conn, setConn] = useState<JfsConnectionState>(data);
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isConnected = conn.status === "CONNECTED";

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!account.trim() || !password) {
      setErrorMsg("Account dan password JFS wajib diisi.");
      return;
    }

    setLoading("CONNECTING");
    try {
      const res = await fetch("/api/settings/integrations/jfs/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, password }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || json.error?.code || "Gagal menghubungkan JFS.");
      }

      setConn(json.data);
      setSuccessMsg("Koneksi Akun JFS berhasil terhubung ke NEXTGEN!");
      setPassword("");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Terjadi kesalahan saat menghubungkan JFS.");
    } finally {
      setLoading(null);
    }
  }

  async function handleTest() {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading("TESTING");
    try {
      const res = await fetch("/api/settings/integrations/jfs/test", {
        method: "POST",
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || json.error?.code || "Pengujian koneksi JFS gagal.");
      }

      setConn(json.data);
      setSuccessMsg("Koneksi Akun JFS berhasil diuji!");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Pengujian koneksi JFS gagal.");
    } finally {
      setLoading(null);
    }
  }

  async function handleReconnect() {
    setLoading("RECONNECTING");
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/settings/integrations/jfs/reconnect", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || "Login ulang JFS gagal");
      setConn(json.data);
      setSuccessMsg("Login ulang JFS berhasil.");
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Login ulang JFS gagal");
    } finally {
      setLoading(null);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Apakah Anda yakin ingin memutuskan integrasi JFS untuk outlet ini?")) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading("DISCONNECTING");
    try {
      const res = await fetch("/api/settings/integrations/jfs/disconnect", {
        method: "POST",
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || json.error?.code || "Gagal memutuskan integrasi JFS.");
      }

      setConn({
        ...conn,
        connected: false,
        status: "DISCONNECTED",
        accountMasked: null,
      });
      setSuccessMsg("Integrasi JFS berhasil diputuskan.");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal memutuskan integrasi JFS.");
    } finally {
      setLoading(null);
    }
  }

  async function handleSync() {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading("SYNCING");
    try {
      const res = await fetch("/api/settings/integrations/jfs/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || json.error?.code || "Sinkronisasi JFS gagal.");
      }
      setSuccessMsg("Sinkronisasi dataset JFS berhasil diproses!");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Sinkronisasi JFS gagal.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <SettingsCard title="Koneksi Akun JFS">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-600">
          Hubungkan akun JFS outlet untuk mengaktifkan sinkronisasi otomatis multi-tenant.
        </p>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            isConnected ? "bg-emerald-100 text-emerald-800" : conn.status === "FAILED" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"
          }`}
        >
          {isConnected ? "Terhubung" : conn.status === "FAILED" ? "Gagal" : "Tidak Terhubung"}
        </span>
      </div>

      {errorMsg && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">
          <ShieldAlert size={18} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
          <CheckCircle2 size={18} className="shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleConnect} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Account JFS">
          <input
            className={inputClass}
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder={conn.accountMasked ?? "Masukkan Account JFS (cth: SUM001A_ADMIN)"}
          />
        </Field>
        <Field label="Password JFS">
          <div className="relative flex items-center">
            <input
              className={`${inputClass} pr-10`}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isConnected ? "•••••••••••• (Credential tersimpan aman)" : "Masukkan Password JFS"}
            />
            <button
              type="button"
              aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 text-slate-400 hover:text-slate-600 focus:outline-none"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>
        <Field label="Outlet NEXTGEN">
          <input className={inputClass} disabled value={conn.outletCode} />
        </Field>
        <Field label="Network JFS">
          <input className={inputClass} disabled value={conn.networkCode ?? "Belum terhubung"} />
        </Field>
        <Field label="Status Koneksi">
          <input className={inputClass} disabled value={isConnected ? "CONNECTED" : conn.status} />
        </Field>
        <Field label="Koneksi / Test Terakhir">
          <input className={inputClass} disabled value={`${formatDate(conn.lastConnectedAt)} / ${formatDate(conn.lastTestedAt)}`} />
        </Field>

        <div className="col-span-full mt-2 flex flex-wrap gap-2">
          <button
            type="submit"
            className={`${buttonClass} bg-slate-900 text-white hover:bg-slate-800`}
            disabled={loading !== null}
          >
            <Link2 size={16} />
            {loading === "CONNECTING" ? "Menghubungkan JFS..." : isConnected ? "Perbarui Credential JFS" : "Hubungkan JFS"}
          </button>

          {isConnected && (
            <>
              <button
                type="button"
                className={`${buttonClass} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
                onClick={handleTest}
                disabled={loading !== null}
              >
                <ShieldCheck size={16} />
                {loading === "TESTING" ? "Menguji..." : "Test Koneksi"}
              </button>

              <button
                type="button"
                className={`${buttonClass} bg-blue-50 text-blue-700 hover:bg-blue-100`}
                onClick={handleReconnect}
                disabled={loading !== null}
              >
                <RefreshCw size={16} />
                {loading === "RECONNECTING" ? "Login Ulang..." : "Login Ulang"}
              </button>

              <button
                type="button"
                className={`${buttonClass} bg-amber-50 text-amber-700 hover:bg-amber-100`}
                onClick={handleSync}
                disabled={loading !== null}
              >
                <RefreshCw size={16} />
                {loading === "SYNCING" ? "Menyinkronkan..." : "Sync Sekarang"}
              </button>

              <button
                type="button"
                className={`${buttonClass} bg-red-50 text-red-700 hover:bg-red-100`}
                onClick={handleDisconnect}
                disabled={loading !== null}
              >
                <X size={16} />
                {loading === "DISCONNECTING" ? "Memutuskan..." : "Putuskan Koneksi"}
              </button>
            </>
          )}
        </div>
      </form>
    </SettingsCard>
  );
}

export function DatasetSyncRow({ dataset, onDetail }: { dataset: DatasetView; onDetail: () => void }) {
  return <div className="grid gap-3 border-b border-slate-100 px-1 py-4 last:border-0 md:grid-cols-[1.2fr_.8fr_1fr_1fr_auto] md:items-center"><div><p className="font-bold text-slate-900">{dataset.label}</p><p className="mt-1 text-xs text-slate-500">{dataset.resultSummary}</p></div><div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusTone[dataset.status]}`}>{statusLabel[dataset.status]}</span></div><p className="text-sm text-slate-600"><span className="md:hidden">Terakhir: </span>{formatDate(dataset.lastSyncedAt)}</p><p className="text-sm text-slate-600">{dataset.recordCount === null ? "Record —" : `${dataset.recordCount} record`}{dataset.errorCode ? <span className="mt-1 block text-xs text-red-600">{dataset.errorCode}</span> : null}</p><button className={`${buttonClass} bg-slate-100 text-slate-700`} disabled={!dataset.detailAvailable} onClick={onDetail}><Eye size={15}/> Detail</button></div>;
}

export function InfrastructureCard({ data }: { data: NonNullable<IntegrationData["infrastructure"]> }) {
  const rows = [
    ["Middleware Status", data.middlewareStatus], ["Database Status", data.databaseStatus], ["Aplikasi Domain", data.applicationDomain ?? "Belum dikonfigurasi"],
    ["Salary Card Share", data.salaryCardStatus], ["Cron Cashflow", formatDate(data.cron.find(({ key }) => key === "CASHFLOW")?.lastRunAt)],
    ["Cron Operasional", formatDate(data.cron.find(({ key }) => key === "OPERATIONAL")?.lastRunAt)], ["Last Successful Sync", formatDate(data.lastSuccessfulSync)], ["Last Failed Sync", formatDate(data.lastFailedSync)],
  ];
  return <SettingsCard title="Infrastruktur"><div className="grid gap-x-6 md:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 text-sm"><span className="text-slate-500">{label}</span><b className="text-right text-slate-800">{value}</b></div>)}</div>{data.middlewareHostMasked && <p className="mt-4 text-xs text-slate-500">Host middleware: {data.middlewareHostMasked}</p>}</SettingsCard>;
}

export function IntegrationActivityTable({ activities }: { activities: ActivityView[] }) {
  return <SettingsCard title="Riwayat Aktivitas Integrasi">{activities.length === 0 ? <div className="grid min-h-32 place-items-center rounded-xl bg-slate-50 text-sm text-slate-500">Belum ada aktivitas integrasi.</div> : <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b text-left text-slate-500">{["Waktu", "Integrasi/Dataset", "Aktivitas", "Status", "Ringkasan"].map((item) => <th key={item} className="px-3 py-3">{item}</th>)}</tr></thead><tbody>{activities.map((item) => <tr key={item.id} className="border-b border-slate-100 align-top"><td className="whitespace-nowrap px-3 py-3">{formatDate(item.occurredAt)}</td><td className="px-3 py-3 font-semibold text-slate-800">{item.integration}</td><td className="px-3 py-3">{item.activity}</td><td className="px-3 py-3">{item.status === "FAILED" ? "Gagal" : item.status === "RUNNING" ? "Sedang Berjalan" : item.status === "SUCCESS" ? "Berhasil" : "Informasi"}</td><td className="max-w-md px-3 py-3 text-slate-600">{item.summary}</td></tr>)}</tbody></table></div>}</SettingsCard>;
}

export function SettingsIntegrations({ data }: { data: IntegrationData }) {
  const [detail, setDetail] = useState<DatasetView | null>(null);
  const summary = data.summary ?? { jfsConnectionStatus: "NOT_CONFIGURED", middlewareStatus: "NOT_CONFIGURED" as const, databaseStatus: "DEGRADED" as const, applicationDomain: null };
  const connection = data.connection ?? { available: true, connected: false, outletCode: "—", networkCode: null, status: "DISCONNECTED", accountMasked: null, lastConnectedAt: null, lastTestedAt: null };
  const middlewareLabel = summary.middlewareStatus === "ONLINE" ? "Online" : summary.middlewareStatus === "OFFLINE" ? "Offline" : "Tidak Dikonfigurasi";
  const jfsStatusLabel = summary.jfsConnectionStatus === "CONNECTED" ? "Terhubung" : summary.jfsConnectionStatus === "FAILED" ? "Gagal" : "Tidak Terhubung";

  return <div className="space-y-5">
    <section><div className="mb-3"><h2 className="text-lg font-bold text-slate-950">Ringkasan Integrasi</h2><p className="text-sm text-slate-500">Status aman layanan yang mendukung operasional outlet.</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><IntegrationStatusCard icon={<Link2 size={20}/>} title="Status JFS" value={jfsStatusLabel} subtitle={connection.networkCode ? `Network: ${connection.networkCode}` : "Koneksi per-outlet mandiri aktif"} tone={summary.jfsConnectionStatus === "CONNECTED" ? "green" : summary.jfsConnectionStatus === "FAILED" ? "red" : "slate"}/><IntegrationStatusCard icon={<Cloud size={20}/>} title="Middleware" value={middlewareLabel} subtitle={data.infrastructure?.middlewareHostMasked ?? "Host belum tersedia"} tone={summary.middlewareStatus === "ONLINE" ? "green" : summary.middlewareStatus === "OFFLINE" ? "red" : "slate"}/><IntegrationStatusCard icon={<Database size={20}/>} title="Database" value={summary.databaseStatus === "CONNECTED" ? "Terhubung" : "Gangguan"} tone={summary.databaseStatus === "CONNECTED" ? "green" : "red"}/><IntegrationStatusCard icon={<Globe2 size={20}/>} title="Domain Aplikasi" value={summary.applicationDomain ?? "Belum dikonfigurasi"}/></div></section>
    <JfsConnectionCard data={connection}/>
    <SettingsCard title="Status Sinkronisasi"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600">Status hanya berasal dari run canonical yang tersedia.</p><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">Segera Tersedia</span></div><div>{(data.datasets ?? []).map((dataset) => <DatasetSyncRow key={dataset.key} dataset={dataset} onDetail={() => setDetail(dataset)}/>)}</div><div className="mt-4"><ComingSoonButton><RefreshCw size={16}/> Sinkronkan Sekarang</ComingSoonButton></div></SettingsCard>
    {data.infrastructure && <InfrastructureCard data={data.infrastructure}/>}<IntegrationActivityTable activities={data.activities ?? []}/>
    <SettingsOwnerControl />
    <p className="flex items-center gap-2 text-xs text-slate-500"><LockKeyhole size={14}/> Credential, token, environment secret, dan response mentah tidak ditampilkan.</p>
    {detail && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="dialog" aria-modal="true"><section className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl"><div className="flex items-center justify-between"><h3 className="text-lg font-bold text-slate-950">Detail {detail.label}</h3><button aria-label="Tutup" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setDetail(null)}><X size={18}/></button></div><dl className="mt-5 grid gap-4 sm:grid-cols-2"><Info label="Status" value={statusLabel[detail.status]}/><Info label="Sinkronisasi terakhir" value={formatDate(detail.lastSyncedAt)}/><Info label="Jumlah record" value={detail.recordCount === null ? "—" : String(detail.recordCount)}/><Info label="Kode error aman" value={detail.errorCode ?? "—"}/></dl><p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{detail.resultSummary}</p><div className="mt-5 flex justify-end"><button className={`${buttonClass} bg-slate-100 text-slate-700`} onClick={() => setDetail(null)}>Tutup</button></div></section></div>}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="text-sm font-semibold text-slate-700"><span className="mb-1 block">{label}</span>{children}</label>; }
function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 text-sm text-slate-700">{value}</dd></div>; }
