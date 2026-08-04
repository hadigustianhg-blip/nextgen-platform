import { AppShell } from "@/components/layout/app-shell";
import { ProfitLossClient } from "@/components/finance/profit-loss-client";
import { requireSession } from "@/lib/auth/session";
import { canExportProfitLoss, canManageProfitLoss, canReadProfitLoss } from "@/modules/profit-loss";

export const metadata = { title: "Profit Loss" };

export default async function JfsCashflowPage() {
  const session = await requireSession();
  return <AppShell session={session}>
    {session.outletId && canReadProfitLoss(session)
      ? <ProfitLossClient canExport={canExportProfitLoss(session)}
          canManage={canManageProfitLoss(session)} />
      : <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">Anda tidak memiliki akses Profit Loss pada outlet aktif.</div>}
  </AppShell>;
}
