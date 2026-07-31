import { AppShell } from "@/components/layout/app-shell";
import { SalaryClosingDetailClient } from "@/components/finance/salary-closing-detail-client";
import { requireSession } from "@/lib/auth/session";
import {
  canManageSalaryAdjustment,
  canManageSalaryClosing,
  canProcessSalary,
  canReadSalaryClosing,
} from "@/modules/salary";

export const metadata = { title: "Detail Salary Closing" };

export default async function SalaryClosingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  return <AppShell session={session}>
    {session.outletId && canReadSalaryClosing(session)
      ? <SalaryClosingDetailClient
          closingId={id}
          canManage={canManageSalaryClosing(session)}
          canAdjust={canManageSalaryAdjustment(session)}
          canProcess={canProcessSalary(session)}/>
      : <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          Anda tidak memiliki akses Salary Closing pada outlet aktif.
        </div>}
  </AppShell>;
}
