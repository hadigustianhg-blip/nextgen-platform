import { NextResponse } from "next/server";
import { attendanceErrorResponse, getTodayAttendance } from "@/modules/attendance";
import { requireTeamAttendanceContext } from "../_access";

export async function GET() {
  try { return NextResponse.json({ success: true, data: await getTodayAttendance(await requireTeamAttendanceContext()) }); }
  catch (error) { return attendanceErrorResponse(error); }
}
