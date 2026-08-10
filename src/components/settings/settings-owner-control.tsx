"use client";

import React, { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, RefreshCw, Layers } from "lucide-react";
import { SettingsCard } from "./settings-shell";

export type OwnerOverviewItem = {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  outletId: string;
  outletName: string;
  outletCode: string;
  provider: string;
  connectionStatus: string;
  networkCode: string | null;
  accountMasked: string | null;
  lastConnectedAt: string | null;
  lastTestedAt: string | null;
  lastFailureAt: string | null;
  lastFailureCode: string | null;
  isActive: boolean;
};

export function SettingsOwnerControl() {
  const [items, setItems] = useState<OwnerOverviewItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function loadOverview() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/settings/integrations/owner");
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || json.error?.code || "Gagal memuat Owner Control Plane.");
      }
      setItems(json.data || []);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal memuat data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();
  }, []);

  return (
    <SettingsCard title="Owner Control Plane — Platform Integrations Overview">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Superadmin Control Plane untuk memantau status koneksi JFS seluruh tenant & outlet di NEXTGEN.
        </p>
        <button
          onClick={loadOverview}
          className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200"
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh Status
        </button>
      </div>

      {errorMsg && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs font-medium text-red-700">
          <ShieldAlert size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="py-6 text-center text-xs text-slate-400">Memuat data pengawasan platform...</div>
      ) : items.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-500">Belum ada credential integrasi terdaftar di platform.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <th className="p-2.5 font-semibold">Tenant</th>
                <th className="p-2.5 font-semibold">Outlet</th>
                <th className="p-2.5 font-semibold">Network JFS</th>
                <th className="p-2.5 font-semibold">Account</th>
                <th className="p-2.5 font-semibold">Status</th>
                <th className="p-2.5 font-semibold">Koneksi Terakhir</th>
                <th className="p-2.5 font-semibold">Status Kesehatan</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="p-2.5 font-bold text-slate-900">
                    <div className="flex items-center gap-1.5">
                      <Layers size={14} className="text-slate-400" />
                      {item.tenantName}
                    </div>
                  </td>
                  <td className="p-2.5 font-medium text-slate-700">
                    {item.outletName} <span className="text-slate-400">({item.outletCode})</span>
                  </td>
                  <td className="p-2.5 font-mono text-slate-600">{item.networkCode ?? "—"}</td>
                  <td className="p-2.5 font-mono text-slate-600">{item.accountMasked ?? "—"}</td>
                  <td className="p-2.5">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        item.connectionStatus === "CONNECTED"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {item.connectionStatus}
                    </span>
                  </td>
                  <td className="p-2.5 text-slate-500">
                    {item.lastConnectedAt ? new Date(item.lastConnectedAt).toLocaleString("id-ID") : "Belum pernah"}
                  </td>
                  <td className="p-2.5">
                    {item.connectionStatus === "CONNECTED" ? (
                      <span className="flex items-center gap-1 font-semibold text-emerald-600">
                        <ShieldCheck size={14} /> Sehat
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-slate-400">
                        Belum Terhubung
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SettingsCard>
  );
}
