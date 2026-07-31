import { AppShell } from "@/components/layout/app-shell";
import { SalaryClosingClient } from "@/components/finance/salary-closing-client";
import { requireSession } from "@/lib/auth/session";
import {
  canManageSalaryClosing,
  canReadSalaryClosing,
} from "@/modules/salary";

export const metadata = { title: "Salary Closing" };

export default async function SalaryClosingPage() {
  const session = await requireSession();
  return <AppShell session={session}>
    {session.outletId && canReadSalaryClosing(session)
      ? <SalaryClosingClient canManage={canManageSalaryClosing(session)}/>
      : <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          Anda tidak memiliki akses Salary Closing pada outlet aktif.
        </div>}
  </AppShell>;
}
