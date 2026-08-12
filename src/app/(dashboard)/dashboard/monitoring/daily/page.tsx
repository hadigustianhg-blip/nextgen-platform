import { AppShell } from "@/components/layout/app-shell";
import { MonitoringDailyClient } from "@/components/monitoring/monitoring-daily-client";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";
import { jakartaOperationalDate } from "@/lib/dates/jakarta-date";

export const metadata = { title: "Monitoring Daily" };

export default async function MonitoringDailyPage({
  searchParams,
}: {
  searchParams?: Promise<{ date?: string; businessDate?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const initialBusinessDate = params?.date || params?.businessDate || jakartaOperationalDate();

  const outlets = await prisma.outlet.findMany({
    where: {
      tenantId: session.tenantId,
      isActive: true,
      ...(session.outletId ? { id: session.outletId } : {}),
    },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  return (
    <AppShell session={session}>
      <MonitoringDailyClient
        outlets={outlets}
        initialOutletId={session.outletId ?? outlets[0]?.id ?? ""}
        initialBusinessDate={initialBusinessDate}
        outletLocked={Boolean(session.outletId)}
        canSync={canAccessResource(session.roles, "MONITORING", "MANAGE")}
      />
    </AppShell>
  );
}
