import { AppShell } from "@/components/layout/app-shell";
import { MonitoringDailyClient } from "@/components/monitoring/monitoring-daily-client";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";

export const metadata = { title: "Monitoring Daily" };

export default async function MonitoringDailyPage() {
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

  return (
    <AppShell session={session}>
      <MonitoringDailyClient
        outlets={outlets}
        initialOutletId={session.outletId ?? outlets[0]?.id ?? ""}
        outletLocked={Boolean(session.outletId)}
        canSync={canAccessResource(session.roles, "MONITORING", "MANAGE")}
      />
    </AppShell>
  );
}
