import type { SessionContext } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/permissions/roles";
import { prisma } from "@/lib/db/prisma";

export function canReadMonitoringDaily(session: SessionContext) {
  return hasAnyRole(session.roles, ["OWNER", "ADMIN", "OPERATIONAL", "VIEWER"]);
}

export async function resolveMonitoringOutlet(
  session: SessionContext,
  requestedOutletId?: string,
) {
  if (session.outletId) {
    if (requestedOutletId && requestedOutletId !== session.outletId)
      return null;
    return session.outletId;
  }
  if (!requestedOutletId) return null;
  const outlet = await prisma.outlet.findFirst({
    where: {
      id: requestedOutletId,
      tenantId: session.tenantId,
      isActive: true,
    },
    select: { id: true },
  });
  return outlet?.id ?? null;
}
