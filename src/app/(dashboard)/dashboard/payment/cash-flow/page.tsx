import { requireSession } from "@/lib/auth/session";
import { CashFlowClient } from "@/components/payment/cash-flow-client";
import { canCreateManualCashFlow, canManageManualCashFlow } from "@/modules/payment";
import { AppShell } from "@/components/layout/app-shell";

export default async function CashFlowPage({ searchParams }: { searchParams: Promise<{ startDate?: string }> }) {
  const session = await requireSession();
  const initialDate = (await searchParams).startDate ?? "";
  return (
    <AppShell session={session}>
      <CashFlowClient
        canCreate={canCreateManualCashFlow(session)}
        canManage={canManageManualCashFlow(session)}
        initialDate={initialDate}
      />
    </AppShell>
  );
}
