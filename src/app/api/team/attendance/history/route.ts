import { NextResponse } from "next/server";
import { attendanceErrorResponse, attendanceHistoryQuerySchema, getAttendanceHistory } from "@/modules/attendance";
import { requireTeamAttendanceContext } from "../_access";

export async function GET(request: Request) {
  try {
    const context = await requireTeamAttendanceContext();
    const parsed = attendanceHistoryQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 });
    return NextResponse.json({ success: true, ...(await getAttendanceHistory(context, parsed.data)) });
  }
  catch (error) { return attendanceErrorResponse(error); }
}
