import { AppShell } from "@/components/layout/app-shell";
import { OperationalSettlementClient } from "@/components/operational-settlement/operational-settlement-client";
import { requireSession } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";

export const metadata = { title: "Operational Settlement" };

export default async function OperationalSettlementPage() {
  const session = await requireSession();
  return <AppShell session={session}>
    {session.outletId && session.outletCode
      ? <OperationalSettlementClient outletCode={session.outletCode} canAdmin={canAccessResource(session.roles, "OPERATIONAL_SETTLEMENT", "FINALIZE")} />
      : <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">Pilih outlet aktif sebelum membuka Operational Settlement.</div>}
  </AppShell>;
}
