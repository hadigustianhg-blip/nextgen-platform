import { getAnySession, resolveTeamContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  canonicalCourierName,
  resolveTeamAcceptedNames,
  teamApiErrorResponse,
  teamJson,
} from "@/modules/team";

const noStore = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET() {
  try {
    const session = await getAnySession();
    if (!session) {
      return teamJson({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401, headers: noStore });
    }
    const context = await resolveTeamContext(session);

    const acceptedNames = await resolveTeamAcceptedNames(context);
    if (acceptedNames.size === 0) {
      return teamJson(
        { success: false, error: { code: "TEAM_EMPLOYEE_NOT_FOUND" } },
        { status: 404, headers: noStore },
      );
    }

    const expenses = await prisma.operationalExpense.findMany({
      where: {
        tenantId: context.tenantId,
        outletId: context.outletId,
        category: "Kasbon",
        status: "VALID",
        teamName: { not: null },
      },
      include: {
        salaryAllocations: {
          where: { status: { in: ["DRAFT", "FINALIZED"] } },
          select: { amount: true },
        },
      },
      orderBy: [{ operationalDate: "desc" }, { createdAt: "desc" }],
    });

    const myExpenses = expenses.filter(
      (e) => e.teamName && acceptedNames.has(canonicalCourierName(e.teamName)),
    );

    let totalAmount = 0;
    let totalPaid = 0;
    let totalRemaining = 0;
    let activeCount = 0;

    const items = myExpenses.map((e) => {
      const amount = Math.round(Number(e.amount ?? 0));
      const paidAmount = Math.round(
        e.salaryAllocations.reduce((sum, a) => sum + Number(a.amount ?? 0), 0),
      );
      const remainingAmount = Math.max(0, amount - paidAmount);

      totalAmount += amount;
      totalPaid += paidAmount;
      totalRemaining += remainingAmount;
      if (remainingAmount > 0) activeCount += 1;

      let status = "AKTIF";
      if (remainingAmount === 0) {
        status = "LUNAS";
      } else if (paidAmount > 0) {
        status = "SEBAGIAN";
      } else {
        status = "AKTIF";
      }

      return {
        id: e.id,
        date: e.operationalDate.toISOString().slice(0, 10),
        category: e.cashAdvanceCategory ?? "Kasbon Operasional",
        description: e.description ?? null,
        amount,
        paidAmount,
        remainingAmount,
        status,
      };
    });

    return teamJson(
      {
        success: true,
        data: {
          employeeName: context.employeeName,
          summary: {
            activeCount,
            totalAmount,
            totalPaid,
            totalRemaining,
          },
          items,
        },
      },
      { headers: noStore },
    );
  } catch (error) {
    return teamApiErrorResponse(error);
  }
}
