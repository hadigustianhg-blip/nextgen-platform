import { AppShell } from "@/components/layout/app-shell";
import { SalaryRecapDetailClient } from "@/components/finance/salary-recap-detail-client";
import { requireSession } from "@/lib/auth/session";
import { canReadSalaryRecap } from "@/modules/salary";

export const metadata = { title: "Detail Salary Recap" };

export default async function SalaryRecapDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  return <AppShell session={session}>
    {session.outletId && canReadSalaryRecap(session)
      ? <SalaryRecapDetailClient closingId={id}/>
      : <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          Anda tidak memiliki akses Salary Recap pada outlet aktif.
        </div>}
  </AppShell>;
}
