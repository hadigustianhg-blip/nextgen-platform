import {
  BadgeDollarSign,
  Banknote,
  Boxes,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  PackageCheck,
  ReceiptText,
  Scale,
  Truck,
} from "lucide-react";
import type { DashboardSnapshot } from "./dashboard.types";

export async function getDashboardSnapshot(
  context: { tenantId: string; outletId: string | null },
): Promise<DashboardSnapshot> {
  // Tenant context is intentionally required now so replacing this mock with a
  // repository cannot accidentally introduce an unscoped query.
  void context;
  return {
    generatedAt: new Intl.DateTimeFormat("id-ID", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "Asia/Jakarta",
    }).format(new Date()),
    metrics: [
      { label: "Sisa Cash", value: "Rp18,4 jt", detail: "Saldo operasional", trend: "+4,2%", tone: "navy", icon: Banknote },
      { label: "Total Setoran", value: "Rp42,8 jt", detail: "Setoran hari ini", trend: "+8,1%", tone: "blue", icon: CircleDollarSign },
      { label: "Tagihan Pickup", value: "Rp12,6 jt", detail: "128 transaksi", trend: "12 baru", tone: "amber", icon: ReceiptText },
      { label: "Operasional Hari Ini", value: "1.284", detail: "Resi diproses", trend: "+6,5%", tone: "violet", icon: Boxes },
      { label: "Total Delivery", value: "986", detail: "76,8% selesai", trend: "+3,4%", tone: "green", icon: Truck },
      { label: "Tanda Terima", value: "912", detail: "Sudah tervalidasi", trend: "92,5%", tone: "blue", icon: ClipboardCheck },
      { label: "Pending Delivery", value: "74", detail: "Perlu tindak lanjut", trend: "-8 hari ini", tone: "amber", icon: Clock3 },
      { label: "SLA Keseluruhan", value: "96,2%", detail: "Di atas target", trend: "+1,2 pt", tone: "green", icon: PackageCheck },
      { label: "Berat Pickup", value: "3.842 kg", detail: "415 pickup", trend: "+11,2%", tone: "navy", icon: Scale },
      { label: "Omzet Pickup", value: "Rp68,7 jt", detail: "Estimasi hari ini", trend: "+9,8%", tone: "violet", icon: BadgeDollarSign },
    ],
    sla: {
      current: 96.2,
      target: 95,
      points: [
        { label: "Sen", value: 94.1 },
        { label: "Sel", value: 95.4 },
        { label: "Rab", value: 94.8 },
        { label: "Kam", value: 96.1 },
        { label: "Jum", value: 95.7 },
        { label: "Sab", value: 96.2 },
      ],
    },
    codCash: "Rp31.480.000",
    scheduledWaybills: "186",
  };
}
