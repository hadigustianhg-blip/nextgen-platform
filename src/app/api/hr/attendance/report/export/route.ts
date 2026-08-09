import { NextResponse } from "next/server";
import { getAnySession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { canAccessResource } from "@/lib/permissions";
import { createWorkbook } from "@/modules/finance/excel";

export async function GET(request: Request) {
  try {
    const session = await getAnySession();
    if (!session) {
      return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
    }
    if (!canAccessResource(session.roles, "ATTENDANCE", "READ")) {
      return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
    }
    if (!session.outletId) {
      return NextResponse.json({ success: false, error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const origin = new URL(request.url).origin;
    const reportUrl = `${origin}/api/hr/attendance/report?${searchParams.toString()}`;

    const reportRes = await fetch(reportUrl, {
      headers: {
        cookie: request.headers.get("cookie") || "",
      },
    });

    if (!reportRes.ok) {
      return NextResponse.json({ success: false, error: { code: "EXPORT_FAILED" } }, { status: 500 });
    }

    const reportBody = await reportRes.json();
    if (!reportBody?.success || !reportBody?.data) {
      return NextResponse.json({ success: false, error: { code: "EXPORT_FAILED" } }, { status: 500 });
    }

    const data = reportBody.data as {
      period: { month: string; outletCode: string };
      employees: Array<{
        name: string;
        division: string;
        presentDays: number;
        lateDays: number;
        permissionDays: number;
        sickDays: number;
        leaveDays: number;
        absentDays: number;
        attendanceRate: number;
      }>;
    };

    const workbook = await createWorkbook([
      {
        name: "REKAP ABSENSI",
        headers: [
          "Nama Team",
          "Divisi",
          "Hadir",
          "Terlambat",
          "Izin",
          "Sakit",
          "Cuti",
          "Tidak Hadir",
          "Persentase Kehadiran",
        ],
        rows: data.employees.map((emp) => [
          emp.name,
          emp.division,
          emp.presentDays,
          emp.lateDays,
          emp.permissionDays,
          emp.sickDays,
          emp.leaveDays,
          emp.absentDays,
          `${emp.attendanceRate.toFixed(2)}%`,
        ]),
      },
    ]);

    await prisma.auditLog.create({
      data: {
        tenantId: session.tenantId,
        outletId: session.outletId,
        actorId: session.userId,
        action: "CREATE",
        entityType: "EXPORT_ATTENDANCE_RECAP",
        metadata: {
          month: data.period.month,
          totalEmployees: data.employees.length,
        },
      },
    });

    const filename = `rekap-absensi-${data.period.outletCode}-${data.period.month}.xlsx`;

    return new NextResponse(new Uint8Array(workbook), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[HR_ATTENDANCE_EXPORT_API]", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_SERVER_ERROR" } },
      { status: 500 },
    );
  }
}
