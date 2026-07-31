import { AppShell } from "@/components/layout/app-shell";
import { SalaryRecapEmpty } from "@/components/finance/salary-recap-empty";
import { requireSession } from "@/lib/auth/session";
import { canReadSalaryRecap } from "@/modules/salary";

export const metadata = { title: "Salary Recap" };

export default async function SalaryRecapPage() {
  const session = await requireSession();
  return <AppShell session={session}>
    {session.outletId && canReadSalaryRecap(session)
      ? <SalaryRecapEmpty/>
      : <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          Anda tidak memiliki akses Salary Recap pada outlet aktif.
        </div>}
  </AppShell>;
}
