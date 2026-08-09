import { NextResponse } from "next/server";
import { getAnySession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

import { canAccessResource } from "@/lib/permissions";
import { jakartaOperationalDate } from "@/lib/dates/jakarta-date";

const noStore = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(request: Request) {
  try {
    const session = await getAnySession();
    if (!session) {
      return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401, headers: noStore });
    }
    if (!canAccessResource(session.roles, "ATTENDANCE", "READ")) {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403, headers: noStore });
    }
    if (!session.outletId) {
      return NextResponse.json({ success: false, error: { code: "OUTLET_REQUIRED" } }, { status: 400, headers: noStore });
    }

    const { searchParams } = new URL(request.url);
    const todayStr = jakartaOperationalDate();
    const currentMonthStr = todayStr.slice(0, 7);
    const month = searchParams.get("month") || currentMonthStr;
    const search = (searchParams.get("search") || "").trim().toLowerCase();
    const divisionFilter = searchParams.get("division") || "";

    const [yearStr, mStr] = month.split("-");
    const year = Number(yearStr) || Number(currentMonthStr.split("-")[0]);
    const m = Number(mStr) || Number(currentMonthStr.split("-")[1]);

    const daysInMonth = new Date(year, m, 0).getDate();
    const startDateStr = `${month}-01`;
    const endDateStr = `${month}-${String(daysInMonth).padStart(2, "0")}`;
    const startDate = new Date(`${startDateStr}T00:00:00.000Z`);
    const endDate = new Date(`${endDateStr}T23:59:59.999Z`);

    let workableDays = 0;
    if (month < currentMonthStr) {
      workableDays = daysInMonth;
    } else if (month === currentMonthStr) {
      const dayToday = Number(todayStr.slice(8, 10));
      workableDays = Math.min(daysInMonth, dayToday);
    } else {
      workableDays = 0;
    }

    const memberships = await prisma.teamMembership.findMany({
      where: {
        tenantId: session.tenantId,
        outletId: session.outletId,
        status: "ACTIVE",
        salaryEmployee: {
          status: "ACTIVE",
          ...(divisionFilter ? { division: divisionFilter as never } : {}),
          ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
        },
      },
      include: {
        salaryEmployee: {
          select: {
            id: true,
            name: true,
            division: true,
          },
        },
      },
      orderBy: { salaryEmployee: { name: "asc" } },
    });

    const attendanceRecords = await prisma.attendanceRecord.findMany({
      where: {
        tenantId: session.tenantId,
        outletId: session.outletId,
        businessDate: { gte: startDate, lte: endDate },
      },
    });

    const approvedLeaves = await prisma.leaveRequest.findMany({
      where: {
        tenantId: session.tenantId,
        outletId: session.outletId,
        status: "APPROVED",
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      include: { salaryEmployee: { select: { name: true } } },
    });

    const attendanceMap = new Map<string, (typeof attendanceRecords)[0]>();
    for (const rec of attendanceRecords) {
      const dateKey = rec.businessDate.toISOString().slice(0, 10);
      attendanceMap.set(`${rec.salaryEmployeeId}_${dateKey}`, rec);
    }

    const leaveMap = new Map<string, (typeof approvedLeaves)[0]>();
    for (const leave of approvedLeaves) {
      const start = new Date(leave.startDate);
      const end = new Date(leave.endDate);
      const curr = new Date(start);
      while (curr <= end) {
        const dateKey = curr.toISOString().slice(0, 10);
        leaveMap.set(`${leave.salaryEmployeeId}_${dateKey}`, leave);
        curr.setDate(curr.getDate() + 1);
      }
    }

    let totalAbsentAll = 0;
    let totalLeavesAll = 0;
    let sumRate = 0;

    const employees = memberships.map((tm) => {
      const emp = tm.salaryEmployee;

      let presentDays = 0;
      let lateDays = 0;
      let permissionDays = 0;
      let sickDays = 0;
      let leaveDays = 0;
      let absentDays = 0;

      const dailyBreakdown: Array<{
        date: string;
        status: "PRESENT" | "ABSENT" | "PERMISSION" | "SICK" | "LEAVE" | "OFF";
        checkInAt: string | null;
        checkOutAt: string | null;
        leaveReason?: string;
      }> = [];

      for (let d = 1; d <= daysInMonth; d++) {
        const dayStr = `${month}-${String(d).padStart(2, "0")}`;
        const dateKey = `${emp.id}_${dayStr}`;
        const attRec = attendanceMap.get(dateKey);
        const leaveRec = leaveMap.get(dateKey);

        let dayStatus: "PRESENT" | "ABSENT" | "PERMISSION" | "SICK" | "LEAVE" | "OFF" = "OFF";
        let checkInAt: string | null = null;
        let checkOutAt: string | null = null;
        let leaveReason: string | undefined = undefined;

        if (attRec && (attRec.status === "PRESENT" || attRec.status === "LATE" || attRec.checkInAt)) {
          dayStatus = "PRESENT";
          presentDays += 1;
          if (attRec.status === "LATE") {
            lateDays += 1;
          }
          checkInAt = attRec.checkInAt ? attRec.checkInAt.toISOString() : null;
          checkOutAt = attRec.checkOutAt ? attRec.checkOutAt.toISOString() : null;
        } else if (leaveRec) {
          if (leaveRec.type === "PERMISSION") {
            dayStatus = "PERMISSION";
            permissionDays += 1;
          } else if (leaveRec.type === "SICK") {
            dayStatus = "SICK";
            sickDays += 1;
          } else {
            dayStatus = "LEAVE";
            leaveDays += 1;
          }
          leaveReason = leaveRec.reason;
        } else if (attRec && (attRec.status === "LEAVE" || attRec.status === "SICK" || attRec.status === "PERMISSION")) {
          if (attRec.status === "PERMISSION") {
            dayStatus = "PERMISSION";
            permissionDays += 1;
          } else if (attRec.status === "SICK") {
            dayStatus = "SICK";
            sickDays += 1;
          } else {
            dayStatus = "LEAVE";
            leaveDays += 1;
          }
        } else {
          if (dayStr <= todayStr) {
            dayStatus = "ABSENT";
            absentDays += 1;
          } else {
            dayStatus = "OFF";
          }
        }

        dailyBreakdown.push({
          date: dayStr,
          status: dayStatus,
          checkInAt,
          checkOutAt,
          leaveReason,
        });
      }

      const attendanceRate =
        workableDays > 0 ? Number(((presentDays / workableDays) * 100).toFixed(2)) : 100;

      totalAbsentAll += absentDays;
      totalLeavesAll += permissionDays + sickDays + leaveDays;
      sumRate += attendanceRate;

      return {
        id: emp.id,
        name: emp.name,
        division: emp.division,
        presentDays,
        lateDays,
        permissionDays,
        sickDays,
        leaveDays,
        absentDays,
        attendanceRate,
        dailyBreakdown,
      };
    });

    const averageRate =
      memberships.length > 0 ? Number((sumRate / memberships.length).toFixed(2)) : 100;

    const outlet = await prisma.outlet.findUnique({
      where: { id: session.outletId },
      select: { code: true, name: true },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          summary: {
            totalTeam: memberships.length,
            averageRate,
            totalAbsent: totalAbsentAll,
            totalLeaves: totalLeavesAll,
          },
          period: {
            month,
            daysInMonth,
            workableDays,
            outletCode: outlet?.code ?? "OUTLET",
          },
          employees,
        },
      },
      { headers: noStore },
    );
  } catch (error) {
    console.error("[HR_ATTENDANCE_REPORT_API]", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_SERVER_ERROR" } },
      { status: 500, headers: noStore },
    );
  }
}
