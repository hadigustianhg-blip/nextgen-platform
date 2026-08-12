import { AppShell } from "@/components/layout/app-shell";
import { MonitoringMonthlyClient } from "@/components/monitoring/monitoring-monthly-client";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { jakartaOperationalDate } from "@/lib/dates/jakarta-date";
import { resolveOperationalBusinessDate } from "@/modules/operational-settlement/operational-settlement.service";

export const metadata = { title: "Monitoring Monthly" };

export default async function MonitoringMonthlyPage() {
  const session = await requireSession();
  const outlets = await prisma.outlet.findMany({
    where: {
      tenantId: session.tenantId,
      isActive: true,
      ...(session.outletId ? { id: session.outletId } : {}),
    },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
  const initialOutletId = session.outletId ?? outlets[0]?.id ?? "";
  const endDate = jakartaOperationalDate();

  return (
    <AppShell session={session}>
      <MonitoringMonthlyClient
        outlets={outlets}
        initialOutletId={initialOutletId}
        initialStartDate={`${endDate.slice(0, 7)}-01`}
        initialEndDate={endDate}
        outletLocked={Boolean(session.outletId)}
      />
    </AppShell>
  );
}
