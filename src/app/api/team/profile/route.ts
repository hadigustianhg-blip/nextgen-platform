import { getAnySession, resolveTeamContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { teamApiErrorResponse, teamJson } from "@/modules/team";

const noStore = { "Cache-Control": "private, no-store, max-age=0" };
const divisionLabels: Record<string, string> = {
  ADMIN: "Admin",
  ADMIN_OPS: "Admin Operasional",
  SALES: "Sales",
  THREE_WHEEL_DRIVER: "Driver Roda Tiga",
  MOTORIST: "Motoris",
  DRIVER: "Driver",
};

export async function GET() {
  try {
    const session = await getAnySession();
    if (!session) return teamJson({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401, headers: noStore });
    const context = await resolveTeamContext(session);
    const membership = await prisma.teamMembership.findFirst({
      where: { id: context.membershipId, userId: context.userId, tenantId: context.tenantId, outletId: context.outletId, status: "ACTIVE" },
      select: {
        user: { select: { email: true, status: true } },
        salaryEmployee: { select: { name: true, division: true, status: true } },
      },
    });
    if (!membership || membership.salaryEmployee.status !== "ACTIVE") return teamJson({ success: false, error: { code: "TEAM_CONTEXT_FORBIDDEN" } }, { status: 403, headers: noStore });
    return teamJson({
      success: true,
      data: {
        name: membership.salaryEmployee.name,
        division: divisionLabels[membership.salaryEmployee.division] ?? membership.salaryEmployee.division,
        outletCode: context.outletCode,
        username: membership.user.email,
        accountStatus: membership.user.status === "ACTIVE" ? "Aktif" : "Nonaktif",
        avatarUrl: "/avatars/default-user.svg",
      },
    }, { headers: noStore });
  } catch (error) {
    return teamApiErrorResponse(error);
  }
}
