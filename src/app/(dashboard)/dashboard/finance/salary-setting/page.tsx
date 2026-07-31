import { AppShell } from "@/components/layout/app-shell";
import { SalarySettingClient } from "@/components/finance/salary-setting-client";
import { requireSession } from "@/lib/auth/session";
import {
  canManageSalarySetting,
  canReadSalarySetting,
} from "@/modules/salary";

export const metadata = { title: "Salary Setting" };

export default async function SalarySettingPage() {
  const session = await requireSession();
  return <AppShell session={session}>
    {session.outletId && canReadSalarySetting(session)
      ? <SalarySettingClient canManage={canManageSalarySetting(session)}/>
      : <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          Anda tidak memiliki akses Salary Setting pada outlet aktif.
        </div>}
  </AppShell>;
}
