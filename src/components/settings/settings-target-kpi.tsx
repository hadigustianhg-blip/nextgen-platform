"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, LoaderCircle, PackageCheck, Save, TimerReset, Warehouse } from "lucide-react";
import { buttonClass, inputClass } from "./settings-shell";

export type TargetKpiForm = {
  achievementDeliveryTarget: string;
  pendingMaximum: string;
  slaTarget: string;
  pickupRevenueTarget: string;
  pickupWeightTarget: string;
  waybillStuckMaximum: string;
};

const initialValues: TargetKpiForm = {
  achievementDeliveryTarget: "",
  pendingMaximum: "",
  slaTarget: "",
  pickupRevenueTarget: "",
  pickupWeightTarget: "",
  waybillStuckMaximum: "",
};

type TargetSource = "CUSTOM" | "CANONICAL" | "UNSET";
type TargetValue = { value: number | null; source: TargetSource };
type TargetKpiData = Record<keyof TargetKpiForm, TargetValue>;
type TargetKpiResponse = { success?: boolean; data?: TargetKpiData; error?: { code?: string } };

const sourceLabel: Record<TargetSource, string> = { CUSTOM: "Target Outlet", CANONICAL: "Default Sistem", UNSET: "Belum diatur" };
const toForm = (data: TargetKpiData): TargetKpiForm => Object.fromEntries(
  Object.entries(data).map(([field, target]) => [field, target.value == null ? "" : String(target.value)]),
) as TargetKpiForm;
const nullableNumber = (value: string) => value.trim() === "" ? null : Number(value);
export const targetKpiPayload = (form: TargetKpiForm) => ({
  achievementDeliveryTarget: nullableNumber(form.achievementDeliveryTarget),
  pendingMaximum: nullableNumber(form.pendingMaximum),
  slaTarget: nullableNumber(form.slaTarget),
  pickupRevenueTarget: nullableNumber(form.pickupRevenueTarget),
  pickupWeightTarget: nullableNumber(form.pickupWeightTarget),
  waybillStuckMaximum: nullableNumber(form.waybillStuckMaximum),
});

async function targetKpiApi(init?: RequestInit) {
  const response = await fetch("/api/settings/target-kpi", { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const text = await response.text();
  let payload: TargetKpiResponse | null = null;
  try { payload = text ? JSON.parse(text) as TargetKpiResponse : null; } catch { payload = null; }
  if (!response.ok || !payload?.data) throw new Error(payload?.error?.code === "VALIDATION_ERROR" ? "Nilai target tidak valid." : "Target & KPI gagal disimpan. Silakan coba kembali.");
  return payload.data;
}

export function NumberInput({
  label,
  value,
  onChange,
  prefix,
  suffix,
  min = 0,
  max,
  step = 1,
  placeholder,
  source,
  helper,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  source?: TargetSource;
  helper?: string;
  disabled?: boolean;
}) {
  return <label className="block text-sm font-semibold text-[var(--nextgen-text-primary)]">
    <span className="mb-2 flex items-center justify-between gap-2"><span>{label}</span>{source && <span className="rounded-full bg-[var(--nextgen-primary-soft)] px-2.5 py-1 text-[10px] font-bold text-[var(--nextgen-primary)]">{sourceLabel[source]}</span>}</span>
    <span className="relative block">
      {prefix && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-[var(--nextgen-text-muted)]">{prefix}</span>}
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClass} h-11 ${prefix ? "pl-10" : ""} ${suffix ? "pr-20" : ""}`}
      />
      {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-[var(--nextgen-text-muted)]">{suffix}</span>}
    </span>
    {helper && <span className="mt-1.5 block text-xs font-normal text-[var(--nextgen-text-muted)]">{helper}</span>}
  </label>;
}

function TargetCard({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return <section className="rounded-[18px] border border-[var(--nextgen-border)] bg-[var(--nextgen-card)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:p-6">
    <div className="mb-5 flex items-start gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--nextgen-primary-soft)] text-[var(--nextgen-primary)]">{icon}</span>
      <div>
        <h2 className="text-base font-bold text-[var(--nextgen-text-primary)]">{title}</h2>
        <p className="mt-1 text-sm leading-5 text-[var(--nextgen-text-secondary)]">{description}</p>
      </div>
    </div>
    <div className="grid gap-4">{children}</div>
  </section>;
}

export function SettingsTargetKpi() {
  const [form, setForm] = useState(initialValues);
  const [baseline, setBaseline] = useState(initialValues);
  const [sources, setSources] = useState<Record<keyof TargetKpiForm, TargetSource>>({
    achievementDeliveryTarget: "CANONICAL", pendingMaximum: "UNSET", slaTarget: "CANONICAL",
    pickupRevenueTarget: "UNSET", pickupWeightTarget: "UNSET", waybillStuckMaximum: "UNSET",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const applyData = useCallback((data: TargetKpiData) => {
    const values = toForm(data);
    setForm(values); setBaseline(values);
    setSources(Object.fromEntries(Object.entries(data).map(([field, target]) => [field, target.source])) as Record<keyof TargetKpiForm, TargetSource>);
  }, []);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { applyData(await targetKpiApi()); }
    catch { setError("Target & KPI gagal dimuat. Silakan coba kembali."); }
    finally { setLoading(false); }
  }, [applyData]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  const update = (field: keyof TargetKpiForm, value: string) => {
    setMessage(""); setError("");
    setForm((current) => ({ ...current, [field]: value }));
  };
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const valid = useMemo(() => {
    const payload = targetKpiPayload(form);
    const percentage = [payload.achievementDeliveryTarget, payload.slaTarget].every((value) => value == null || Number.isFinite(value) && value >= 0 && value <= 100);
    const nonNegative = [payload.pickupRevenueTarget, payload.pickupWeightTarget].every((value) => value == null || Number.isFinite(value) && value >= 0);
    const integers = [payload.pendingMaximum, payload.waybillStuckMaximum].every((value) => value == null || Number.isFinite(value) && Number.isInteger(value) && value >= 0);
    return percentage && nonNegative && integers;
  }, [form]);
  async function save() {
    if (saving || !dirty || !valid) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const data = await targetKpiApi({ method: "PUT", body: JSON.stringify(targetKpiPayload(form)) });
      applyData(data); setMessage("Target & KPI berhasil disimpan.");
    } catch (cause) {
      setForm(baseline);
      setError(cause instanceof Error ? cause.message : "Target & KPI gagal disimpan. Silakan coba kembali.");
    } finally { setSaving(false); }
  }

  if (loading) return <div className="grid gap-5 md:grid-cols-2" aria-label="Memuat Target & KPI">{[0, 1, 2, 3].map((item) => <div key={item} className="h-56 animate-pulse rounded-[18px] bg-slate-200"/>)}</div>;

  return <div className="space-y-5">
    <div className="grid items-stretch gap-5 md:grid-cols-2">
      <TargetCard title="Monitoring" description="Target utama performa delivery harian." icon={<Activity size={21} aria-hidden="true"/>}>
        <NumberInput label="Achievement Delivery" value={form.achievementDeliveryTarget} onChange={(value) => update("achievementDeliveryTarget", value)} suffix="%" max={100} step={0.01} placeholder="Belum diatur" source={sources.achievementDeliveryTarget} />
        <NumberInput label="Pending Maksimal" value={form.pendingMaximum} onChange={(value) => update("pendingMaximum", value)} suffix="paket" placeholder="Belum diatur" source={sources.pendingMaximum} helper="Batas pending yang masih dapat diterima."/>
      </TargetCard>

      <TargetCard title="SLA" description="Ambang pencapaian SLA operasional." icon={<TimerReset size={21} aria-hidden="true"/>}>
        <NumberInput label="Target SLA" value={form.slaTarget} onChange={(value) => update("slaTarget", value)} suffix="%" max={100} step={0.01} placeholder="Belum diatur" source={sources.slaTarget}/>
      </TargetCard>

      <TargetCard title="Pickup" description="Target omset dan berat pickup outlet." icon={<PackageCheck size={21} aria-hidden="true"/>}>
        <NumberInput label="Target Pickup Omset" value={form.pickupRevenueTarget} onChange={(value) => update("pickupRevenueTarget", value)} prefix="Rp" step={1000} placeholder="Belum diatur" source={sources.pickupRevenueTarget} helper="Target omset pickup per hari."/>
        <NumberInput label="Target Berat Pickup" value={form.pickupWeightTarget} onChange={(value) => update("pickupWeightTarget", value)} suffix="Kg" step={0.01} placeholder="Belum diatur" source={sources.pickupWeightTarget} helper="Target berat pickup per hari."/>
      </TargetCard>

      <TargetCard title="Inventory" description="Batas aman waybill yang tertahan." icon={<Warehouse size={21} aria-hidden="true"/>}>
        <NumberInput label="Maksimal Waybill Stuck" value={form.waybillStuckMaximum} onChange={(value) => update("waybillStuckMaximum", value)} suffix="waybill" placeholder="Belum diatur" source={sources.waybillStuckMaximum} helper="Batas maksimal inventory stuck pada periode aktif."/>
      </TargetCard>
    </div>

    <div className="flex flex-col items-stretch justify-between gap-3 rounded-[18px] border border-[var(--nextgen-border)] bg-[var(--nextgen-card)] p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)] sm:flex-row sm:items-center">
      <div><p className="text-sm text-[var(--nextgen-text-secondary)]">Periksa kembali seluruh target sebelum menyimpan perubahan.</p>{message && <p className="mt-1 text-sm font-medium text-[var(--nextgen-success)]" role="status">{message}</p>}{error && <p className="mt-1 text-sm font-medium text-[var(--nextgen-danger)]" role="alert">{error}</p>}{!valid && <p className="mt-1 text-sm font-medium text-[var(--nextgen-danger)]" role="alert">Nilai target tidak valid.</p>}</div>
      <button type="button" disabled={!dirty || !valid || saving} className={`${buttonClass} inline-flex h-11 items-center justify-center gap-2 px-5`} onClick={() => void save()}>{saving ? <LoaderCircle className="animate-spin" size={17} aria-hidden="true"/> : <Save size={17} aria-hidden="true"/>} {saving ? "Menyimpan..." : "Simpan Perubahan"}</button>
    </div>
  </div>;
}
