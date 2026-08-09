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

    // 1. Active Team Members in current Outlet
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

    // 2. Attendance Records in month range
    const attendanceRecords = await prisma.attendanceRecord.findMany({
      where: {
        tenantId: session.tenantId,
        outletId: session.outletId,
        businessDate: { gte: startDate, lte: endDate },
      },
    });

    // 3. Approved & Pending Leave Requests
    const [approvedLeaves, pendingLeaves] = await Promise.all([
      prisma.leaveRequest.findMany({
        where: {
          tenantId: session.tenantId,
          outletId: session.outletId,
          status: "APPROVED",
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
        include: { salaryEmployee: { select: { name: true } } },
      }),
      prisma.leaveRequest.findMany({
        where: {
          tenantId: session.tenantId,
          outletId: session.outletId,
          status: "PENDING",
        },
        include: { salaryEmployee: { select: { name: true, division: true } } },
        orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    // Map Attendance by salaryEmployeeId_YYYY-MM-DD
    const attendanceMap = new Map<string, (typeof attendanceRecords)[0]>();
    for (const rec of attendanceRecords) {
      const dateKey = rec.businessDate.toISOString().slice(0, 10);
      attendanceMap.set(`${rec.salaryEmployeeId}_${dateKey}`, rec);
    }

    // Map Approved Leaves by salaryEmployeeId_YYYY-MM-DD
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

    let presentTodayCount = 0;
    let absentTodayCount = 0;

    const employees = memberships.map((tm) => {
      const emp = tm.salaryEmployee;
      const days: Record<
        string,
        {
          status: "PRESENT" | "ABSENT" | "PERMISSION" | "SICK" | "LEAVE" | "OFF";
          recordId?: string;
          checkInAt?: string | null;
          checkOutAt?: string | null;
          leaveRequestId?: string;
          leaveReason?: string;
        }
      > = {};

      for (let d = 1; d <= daysInMonth; d++) {
        const dayStr = `${month}-${String(d).padStart(2, "0")}`;
        const dateKey = `${emp.id}_${dayStr}`;
        const attRec = attendanceMap.get(dateKey);
        const leaveRec = leaveMap.get(dateKey);

        let cellStatus: "PRESENT" | "ABSENT" | "PERMISSION" | "SICK" | "LEAVE" | "OFF" = "OFF";
        let detailProps: Partial<(typeof days)[string]> = {};

        if (attRec && (attRec.status === "PRESENT" || attRec.status === "LATE" || attRec.checkInAt)) {
          cellStatus = "PRESENT";
          detailProps = {
            recordId: attRec.id,
            checkInAt: attRec.checkInAt ? attRec.checkInAt.toISOString() : null,
            checkOutAt: attRec.checkOutAt ? attRec.checkOutAt.toISOString() : null,
          };
        } else if (leaveRec) {
          if (leaveRec.type === "PERMISSION") cellStatus = "PERMISSION";
          else if (leaveRec.type === "SICK") cellStatus = "SICK";
          else cellStatus = "LEAVE";
          detailProps = {
            leaveRequestId: leaveRec.id,
            leaveReason: leaveRec.reason,
          };
        } else if (attRec && (attRec.status === "LEAVE" || attRec.status === "SICK" || attRec.status === "PERMISSION")) {
          if (attRec.status === "PERMISSION") cellStatus = "PERMISSION";
          else if (attRec.status === "SICK") cellStatus = "SICK";
          else cellStatus = "LEAVE";
        } else {
          if (dayStr <= todayStr) {
            cellStatus = "ABSENT";
          } else {
            cellStatus = "OFF";
          }
        }

        days[dayStr] = {
          status: cellStatus,
          ...detailProps,
        };

        if (dayStr === todayStr) {
          if (cellStatus === "PRESENT") {
            presentTodayCount += 1;
          } else if (cellStatus === "ABSENT") {
            absentTodayCount += 1;
          }
        }
      }

      return {
        id: emp.id,
        name: emp.name,
        division: emp.division,
        days,
      };
    });

    const pendingSummary = pendingLeaves.map((l) => ({
      id: l.id,
      employeeName: l.salaryEmployee.name,
      division: l.salaryEmployee.division,
      type: l.type,
      startDate: l.startDate.toISOString().slice(0, 10),
      endDate: l.endDate.toISOString().slice(0, 10),
      reason: l.reason,
      submittedAt: l.submittedAt.toISOString(),
    }));

    return NextResponse.json(
      {
        success: true,
        data: {
          summary: {
            totalTeam: memberships.length,
            presentToday: presentTodayCount,
            absentToday: absentTodayCount,
            pendingLeaveCount: pendingLeaves.length,
          },
          month,
          daysInMonth,
          todayStr,
          employees,
          pendingSummary,
        },
      },
      { headers: noStore },
    );
  } catch (error) {
    console.error("[HR_ATTENDANCE_MONITORING_API]", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_SERVER_ERROR" } },
      { status: 500, headers: noStore },
    );
  }
}
