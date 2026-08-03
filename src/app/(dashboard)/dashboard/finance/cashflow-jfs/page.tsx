import { AppShell } from "@/components/layout/app-shell";
import { ProfitLossClient } from "@/components/finance/profit-loss-client";
import { requireSession } from "@/lib/auth/session";
import { canExportFinance } from "@/modules/finance";
import { canManageProfitLoss } from "@/modules/profit-loss";

export const metadata = { title: "Profit Loss" };

export default async function JfsCashflowPage() {
  const session = await requireSession();
  return <AppShell session={session}>
    {session.outletId
      ? <ProfitLossClient canExport={canExportFinance(session)}
          canManage={canManageProfitLoss(session)} />
      : <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">Pilih outlet aktif untuk membuka Profit Loss.</div>}
  </AppShell>;
}
