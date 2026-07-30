import { AppShell } from "@/components/layout/app-shell";
import { OperationalDetailClient } from "@/components/finance/operational-detail-client";
import { requireSession } from "@/lib/auth/session";
import { canExportFinance } from "@/modules/finance";

export const metadata = { title: "Rincian Operasional" };

export default async function OperationalDetailPage() {
  const session = await requireSession();
  return <AppShell session={session}>
    {session.outletId
      ? <OperationalDetailClient canExport={canExportFinance(session)} />
      : <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">Pilih outlet aktif untuk membuka Rincian Operasional.</div>}
  </AppShell>;
}
