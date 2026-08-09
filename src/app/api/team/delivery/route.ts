import { getAnySession, resolveTeamContext } from "@/lib/auth/session";
import { getActiveDispatchDataset } from "@/modules/delivery-settlement/active-dispatch-dataset";
import { calculateAchievement } from "@/modules/monitoring/monitoring-daily.calculation";
import { resolveOperationalBusinessDate } from "@/modules/operational-settlement/operational-settlement.service";
import {
  canonicalCourierName,
  resolveTeamAcceptedCourierNames,
  teamApiErrorResponse,
  teamJson,
} from "@/modules/team";

const noStore = { "Cache-Control": "private, no-store, max-age=0" };

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
    const requestedDate = searchParams.get("date");

    const { activeBusinessDate } = await resolveOperationalBusinessDate({
      tenantId: context.tenantId,
      outletId: context.outletId,
    });

    const businessDate = (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate))
      ? requestedDate
      : activeBusinessDate;

    const operationalDate = new Date(`${businessDate}T00:00:00.000Z`);

    const records = await getActiveDispatchDataset({
      tenantId: context.tenantId,
      outletId: context.outletId,
      operationalDate,
    });

    const myRecords = records.filter(
      (record) => record.courierNameRaw && acceptedNames.has(canonicalCourierName(record.courierNameRaw)),
    );

    const deliveryToday = myRecords.length;
    const totalTtd = myRecords.filter(
      (record) => canonicalCourierName(record.deliveryStatusRaw) === "PENERIMAAN NORMAL",
    ).length;
    const pending = deliveryToday - totalTtd;
    const rawAchievement = calculateAchievement(totalTtd, deliveryToday);
    const achievement = Math.round(rawAchievement * 100) / 100;

    const shipments = myRecords.map((record) => ({
      id: record.id,
      waybillNo: record.waybillNo,
      deliveryStatus: record.deliveryStatusRaw ?? "Dalam Pengiriman",
      receiverName: record.receiverName ?? null,
      dispatchAt: record.dispatchAt ? record.dispatchAt.toISOString() : record.sourceFetchedAt.toISOString(),
      chargeWeight: record.chargeWeight ? Number(record.chargeWeight) : 0,
    }));

    return teamJson(
      {
        success: true,
        data: {
          businessDate,
          employeeName: context.employeeName,
          summary: {
            deliveryToday,
            totalTtd,
            pending,
            achievement,
          },
          shipments,
        },
      },
      { headers: noStore },
    );
  } catch (error) {
    return teamApiErrorResponse(error);
  }
}
