import { AppShell } from "@/components/layout/app-shell";
import { DashboardOverviewClient } from "@/components/dashboard/dashboard-overview-client";
import { requireSession } from "@/lib/auth/session";
import { jakartaCurrentMonthRange } from "@/lib/dates/jakarta-date";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await requireSession();
  const period = jakartaCurrentMonthRange();

  return (
    <AppShell session={session}>
      <DashboardOverviewClient
        initialStartDate={period.startDate}
        initialEndDate={period.endDate}
        outletCode={session.outletCode}
      />
    </AppShell>
  );
}
