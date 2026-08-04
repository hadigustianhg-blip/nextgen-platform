import { NextResponse } from "next/server";
import { attendanceErrorResponse, attendanceMonitoringQuerySchema, listAttendance } from "@/modules/attendance";
import { requireAttendanceAdmin } from "./_access";

export async function GET(request: Request) {
  try {
    const session = await requireAttendanceAdmin("READ");
    const parsed = attendanceMonitoringQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 });
    return NextResponse.json({ success: true, ...(await listAttendance(session, parsed.data)) });
  }
  catch (error) { return attendanceErrorResponse(error); }
}
