import { AppShell } from "@/components/layout/app-shell";
import { JfsCashflowClient } from "@/components/finance/jfs-cashflow-client";
import { requireSession } from "@/lib/auth/session";
import { canExportFinance } from "@/modules/finance";

export const metadata = { title: "Cashflow JFS" };

export default async function JfsCashflowPage() {
  const session = await requireSession();
  return <AppShell session={session}>
    {session.outletId
      ? <JfsCashflowClient canExport={canExportFinance(session)} />
      : <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">Pilih outlet aktif untuk membuka Cashflow JFS.</div>}
  </AppShell>;
}
