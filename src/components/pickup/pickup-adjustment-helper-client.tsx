"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle, RefreshCw } from "lucide-react";
import { formatDateTime, formatMoney } from "./pickup-format";

type PaymentStatus = "BELUM_BAYAR" | "SUDAH_BAYAR" | "LEBIH_BAYAR";
type PaymentMethod = "" | "TUNAI" | "TRANSFER";
type Account = { id: string; label: string };

type ResolverData = {
  pickupId: string;
  waybillNo: string;
  operationalDate: string;
  staff: string | null;
  sender: string | null;
  freightAmount: string;
  settlement: {
    discountAmount: string;
    finalObligation: string;
    totalPaid: string;
    remainingAmount: string;
    paymentStatus: PaymentStatus;
    paymentMethod: string | null;
  };
};

type PickupDetail = {
  discountAmount: string;
  totalPaid: string;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  transferAccountId: string | null;
  note: string | null;
};

type SuccessSummary = {
  waybillNo: string;
  status: string;
  method: string | null;
  totalPaid: string;
};

const WAYBILL_PATTERN = /^[A-Za-z0-9]{1,100}$/;

export function buildPickupAdjustmentPayload(input: {
  requestId: string;
  discount: string;
  status: "BELUM_BAYAR" | "SUDAH_BAYAR";
  method: PaymentMethod;
  accountId: string;
  note: string;
}) {
  const isPaid = input.status === "SUDAH_BAYAR";
  return {
    requestId: input.requestId,
    discountAmount: input.discount,
    status: input.status,
    paymentMethod: isPaid ? input.method || null : null,
    transferAccountId:
      isPaid && input.method === "TRANSFER" ? input.accountId || null : null,
    note: input.note.trim() || null,
  };
}

export function PickupAdjustmentHelperClient({ waybillNo }: { waybillNo: string }) {
  const normalizedWaybill = waybillNo.trim();
  const validWaybill = WAYBILL_PATTERN.test(normalizedWaybill);
  const [pickup, setPickup] = useState<ResolverData | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(validWaybill);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [discount, setDiscount] = useState("0");
  const [status, setStatus] = useState<"BELUM_BAYAR" | "SUDAH_BAYAR">("BELUM_BAYAR");
  const [method, setMethod] = useState<PaymentMethod>("");
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [accountError, setAccountError] = useState("");
  const [confirmCancellation, setConfirmCancellation] = useState(false);
  const [currentTotalPaid, setCurrentTotalPaid] = useState("0");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<SuccessSummary | null>(null);

  const applyCurrentState = useCallback((resolved: ResolverData, detail?: PickupDetail) => {
    const current = detail ?? resolved.settlement;
    setDiscount(current.discountAmount);
    setStatus(current.paymentStatus === "SUDAH_BAYAR" ? "SUDAH_BAYAR" : "BELUM_BAYAR");
    setMethod(current.paymentMethod === "TUNAI" || current.paymentMethod === "TRANSFER" ? current.paymentMethod : "");
    setAccountId(detail?.transferAccountId ?? "");
    setNote(detail?.note ?? "");
    setCurrentTotalPaid(current.totalPaid);
  }, []);

  const resolvePickup = useCallback(async () => {
    if (!validWaybill) {
      setLoading(false);
      setError("Nomor waybill tidak valid.");
      return;
    }

    setLoading(true);
    setError("");
    setNotFound(false);
    setSuccess(null);
    try {
      const response = await fetch(
        `/api/pickup/settlements/resolve-by-waybill?waybillNo=${encodeURIComponent(normalizedWaybill)}`,
        { cache: "no-store" },
      );
      const body = await response.json();
      if (response.status === 404 && body.error?.code === "PICKUP_NOT_FOUND") {
        setPickup(null);
        setNotFound(true);
        return;
      }
      if (!response.ok) throw new Error(body.error?.message ?? "Pickup belum dapat dimuat.");

      const resolved = body.data as ResolverData;
      setPickup(resolved);
      applyCurrentState(resolved);

      const [detailResponse, accountsResponse] = await Promise.all([
        fetch(`/api/pickup/settlements/${resolved.pickupId}`, { cache: "no-store" }),
        fetch("/api/pickup/transfer-accounts", { cache: "no-store" }),
      ]);
      if (detailResponse.ok) {
        const detailBody = await detailResponse.json();
        applyCurrentState(resolved, detailBody.data as PickupDetail);
      }
      if (accountsResponse.ok) {
        const accountsBody = await accountsResponse.json();
        setAccounts(accountsBody.data as Account[]);
      }
    } catch (cause) {
      setPickup(null);
      setError(cause instanceof Error ? cause.message : "Pickup belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, [applyCurrentState, normalizedWaybill, validWaybill]);

  useEffect(() => {
    void resolvePickup();
  }, [resolvePickup]);

  const totalAfterDiscount = useMemo(
    () => Math.max(0, Number(pickup?.freightAmount ?? 0) - Number(discount || 0)),
    [discount, pickup?.freightAmount],
  );

  async function saveAdjustment() {
    if (!pickup || saving) return;
    const cancellingExistingPayment = status === "BELUM_BAYAR" && Number(currentTotalPaid) > 0;
    if (cancellingExistingPayment && !note.trim()) {
      setError("Alasan pembatalan wajib diisi.");
      return;
    }
    if (cancellingExistingPayment && !confirmCancellation) {
      setConfirmCancellation(true);
      return;
    }
    if (status === "SUDAH_BAYAR" && !method) {
      setError("Metode bayar wajib dipilih.");
      return;
    }
    if (status === "SUDAH_BAYAR" && method === "TRANSFER" && !accountId) {
      setAccountError("Pilih rekening transfer terlebih dahulu.");
      return;
    }

    setSaving(true);
    setError("");
    setAccountError("");
    try {
      const response = await fetch(`/api/pickup/settlements/${pickup.pickupId}/adjust`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildPickupAdjustmentPayload({
          requestId: crypto.randomUUID(),
          discount,
          status,
          method,
          accountId,
          note,
        })),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Penyesuaian gagal disimpan.");
      setSuccess({
        waybillNo: body.data.waybillNo,
        status: body.data.paymentStatus,
        method: body.data.paymentMethod,
        totalPaid: body.data.totalPaid,
      });
      setCurrentTotalPaid(body.data.totalPaid);
      setConfirmCancellation(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Penyesuaian gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-[620px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
      <header className="border-b border-slate-100 px-5 py-5 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">NEXTGEN Helper</p>
        <h1 className="mt-1 text-xl font-bold text-slate-950">Penyesuaian Pickup</h1>
        <p className="mt-1 text-sm text-slate-500">Perubahan menggunakan alur settlement yang sama dengan dashboard.</p>
      </header>

      {loading && (
        <div className="flex min-h-64 items-center justify-center gap-2 p-6 text-sm font-medium text-slate-600">
          <LoaderCircle className="animate-spin" size={18} /> Mencari Pickup…
        </div>
      )}

      {!loading && !validWaybill && (
        <div role="alert" className="m-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">
          Nomor waybill tidak valid.
        </div>
      )}

      {!loading && validWaybill && notFound && (
        <div className="p-6 text-center">
          <p className="font-semibold text-slate-800">Pickup belum tersedia di NEXTGEN.</p>
          <button type="button" onClick={() => void resolvePickup()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white">
            <RefreshCw size={16} /> Coba Lagi
          </button>
        </div>
      )}

      {!loading && error && !pickup && validWaybill && (
        <div role="alert" className="m-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>
      )}

      {!loading && pickup && (
        <>
          <div className="grid gap-2 bg-slate-50 p-5 sm:grid-cols-2 sm:p-6">
            {[
              ["Tanggal", formatDateTime(pickup.operationalDate)],
              ["Waybill", pickup.waybillNo],
              ["Staff", pickup.staff ?? "—"],
              ["Pengirim", pickup.sender ?? "—"],
              ["Ongkir", formatMoney(pickup.freightAmount)],
              ["Total diterima saat ini", formatMoney(currentTotalPaid)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-100 bg-white p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
                <p className="mt-1 break-words text-sm font-semibold text-slate-800">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            <label className="text-sm font-semibold text-slate-700">Diskon
              <input aria-label="Diskon" type="number" min="0" max={pickup.freightAmount} step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 font-normal" />
            </label>
            <label className="text-sm font-semibold text-slate-700">Status
              <select aria-label="Status" value={status} onChange={(event) => {
                const nextStatus = event.target.value as "BELUM_BAYAR" | "SUDAH_BAYAR";
                setStatus(nextStatus);
                setError("");
                setConfirmCancellation(false);
                if (nextStatus === "BELUM_BAYAR") {
                  setMethod("");
                  setAccountId("");
                  setAccountError("");
                }
              }} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 font-normal">
                <option value="BELUM_BAYAR">Belum Bayar</option>
                <option value="SUDAH_BAYAR">Sudah Bayar</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">Metode Bayar
              <select aria-label="Metode Bayar" disabled={status === "BELUM_BAYAR"} value={method} onChange={(event) => {
                const nextMethod = event.target.value as PaymentMethod;
                setMethod(nextMethod);
                if (nextMethod !== "TRANSFER") {
                  setAccountId("");
                  setAccountError("");
                }
              }} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 font-normal disabled:bg-slate-100">
                <option value="">Pilih metode</option>
                <option value="TUNAI">Tunai</option>
                <option value="TRANSFER">Transfer</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">Rekening Transfer
              <select aria-label="Rekening Transfer" disabled={status !== "SUDAH_BAYAR" || method !== "TRANSFER"} value={accountId} onChange={(event) => { setAccountId(event.target.value); setAccountError(""); }} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 font-normal disabled:bg-slate-100">
                <option value="">Pilih rekening</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
              </select>
              {accountError && <span role="alert" className="mt-1.5 block text-xs font-medium text-red-600">{accountError}</span>}
            </label>
            <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Keterangan
              <textarea aria-label="Keterangan" value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 font-normal" />
            </label>
            <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900 sm:col-span-2">
              Total setelah diskon: <strong>{formatMoney(totalAfterDiscount)}</strong>
            </div>
            {status === "BELUM_BAYAR" && Number(currentTotalPaid) > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:col-span-2">
                Mengubah status menjadi Belum Bayar akan membatalkan pembayaran sebelumnya. Keterangan wajib diisi.
              </div>
            )}
            {error && <div role="alert" className="text-sm font-medium text-red-600 sm:col-span-2">{error}</div>}
            {success && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 sm:col-span-2">
                <p className="flex items-center gap-2 font-bold"><CheckCircle2 size={17} /> Penyesuaian berhasil disimpan.</p>
                <dl className="mt-3 grid grid-cols-2 gap-2">
                  <div><dt className="text-xs text-emerald-700">Waybill</dt><dd className="font-semibold">{success.waybillNo}</dd></div>
                  <div><dt className="text-xs text-emerald-700">Status</dt><dd className="font-semibold">{success.status}</dd></div>
                  <div><dt className="text-xs text-emerald-700">Metode</dt><dd className="font-semibold">{success.method ?? "—"}</dd></div>
                  <div><dt className="text-xs text-emerald-700">Total diterima</dt><dd className="font-semibold">{formatMoney(success.totalPaid)}</dd></div>
                </dl>
              </div>
            )}
          </div>
          {confirmCancellation && (
            <div className="border-t border-amber-200 bg-amber-50 px-5 py-4 sm:px-6">
              <p className="font-bold text-amber-950">Batalkan pembayaran Pickup ini?</p>
              <p className="mt-1 text-sm text-amber-900">Histori tetap disimpan dan waybill kembali berstatus Belum Bayar.</p>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setConfirmCancellation(false)} className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold">Kembali</button>
                <button type="button" disabled={saving} onClick={() => void saveAdjustment()} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">Ya, Batalkan Pembayaran</button>
              </div>
            </div>
          )}
          <footer className="flex justify-end border-t border-slate-100 px-5 py-4 sm:px-6">
            <button type="button" onClick={() => void saveAdjustment()} disabled={saving || confirmCancellation} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">
              {saving && <LoaderCircle size={16} className="animate-spin" />} Simpan Penyesuaian
            </button>
          </footer>
        </>
      )}
    </section>
  );
}
