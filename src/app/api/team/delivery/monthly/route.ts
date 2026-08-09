import { getAnySession, resolveTeamContext } from "@/lib/auth/session";
import { getActiveDispatchRecords } from "@/modules/delivery-settlement/active-dispatch-dataset";
import { calculateAchievement } from "@/modules/monitoring/monitoring-daily.calculation";
import { resolveOperationalBusinessDate } from "@/modules/operational-settlement/operational-settlement.service";
import {
  canonicalCourierName,
  resolveTeamAcceptedCourierNames,
  teamApiErrorResponse,
  teamJson,
} from "@/modules/team";

const noStore = { "Cache-Control": "private, no-store, max-age=0" };

function getMonthBoundary(monthStr?: string | null, activeBusinessDate?: string) {
  const targetMonth = (monthStr && /^\d{4}-\d{2}$/.test(monthStr))
    ? monthStr
    : (activeBusinessDate ?? new Date().toISOString().slice(0, 10)).slice(0, 7);

  const [yearStr, mStr] = targetMonth.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(mStr, 10);

  const startDate = `${targetMonth}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDayStr = String(lastDay).padStart(2, "0");
  const endDate = `${targetMonth}-${lastDayStr}`;

  return { month: targetMonth, startDate, endDate };
}

export async function GET(request: Request) {
  try {
    const session = await getAnySession();
    if (!session) {
      return teamJson({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401, headers: noStore });
    }
    const context = await resolveTeamContext(session);
    const acceptedNames = await resolveTeamAcceptedCourierNames(context);

    if (acceptedNames.size === 0) {
      return teamJson(
        { success: false, error: { code: "TEAM_EMPLOYEE_NOT_FOUND" } },
        { status: 404, headers: noStore },
      );
    }

    const searchParams = new URL(request.url).searchParams;
    const requestedMonth = searchParams.get("month");

    const { activeBusinessDate } = await resolveOperationalBusinessDate({
      tenantId: context.tenantId,
      outletId: context.outletId,
    });

    const { month, startDate, endDate } = getMonthBoundary(requestedMonth, activeBusinessDate);

    const periodStart = new Date(`${startDate}T00:00:00.000Z`);
    const periodEnd = new Date(`${endDate}T00:00:00.000Z`);

    const records = await getActiveDispatchRecords({
      tenantId: context.tenantId,
      outletId: context.outletId,
      periodStart,
      periodEnd,
    });

    const myRecords = records.filter(
      (record) => record.courierNameRaw && acceptedNames.has(canonicalCourierName(record.courierNameRaw)),
    );

    const totalDelivery = myRecords.length;
    const totalTtd = myRecords.filter(
      (record) => canonicalCourierName(record.deliveryStatusRaw) === "PENERIMAAN NORMAL",
    ).length;
    const pending = totalDelivery - totalTtd;
    const rawAchievement = calculateAchievement(totalTtd, totalDelivery);
    const achievement = Math.round(rawAchievement * 100) / 100;

    const byDate = new Map<string, { totalDelivery: number; totalTtd: number }>();
    for (const record of myRecords) {
      const dateKey = record.operationalDate.toISOString().slice(0, 10);
      const group = byDate.get(dateKey) ?? { totalDelivery: 0, totalTtd: 0 };
      group.totalDelivery += 1;
      if (canonicalCourierName(record.deliveryStatusRaw) === "PENERIMAAN NORMAL") {
        group.totalTtd += 1;
      }
      byDate.set(dateKey, group);
    }

    const dailyBreakdown = [...byDate.entries()]
      .map(([date, group]) => {
        const dayPending = group.totalDelivery - group.totalTtd;
        const dayAch = calculateAchievement(group.totalTtd, group.totalDelivery);
        return {
          date,
          totalDelivery: group.totalDelivery,
          totalTtd: group.totalTtd,
          pending: dayPending,
          achievement: Math.round(dayAch * 100) / 100,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    return teamJson(
      {
        success: true,
        data: {
          month,
          startDate,
          endDate,
          employeeName: context.employeeName,
          summary: {
            totalDelivery,
            totalTtd,
            pending,
            achievement,
          },
          dailyBreakdown,
        },
      },
      { headers: noStore },
    );
  } catch (error) {
    return teamApiErrorResponse(error);
  }
}
