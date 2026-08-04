import { NextResponse } from "next/server";
import { attendanceErrorResponse, attendanceLocationInputSchema, clockIn } from "@/modules/attendance";
import { requireTeamAttendanceContext } from "../_access";

export async function POST(request: Request) {
  try {
    const context = await requireTeamAttendanceContext();
    const parsed = attendanceLocationInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 });
    return NextResponse.json({ success: true, data: await clockIn(context, parsed.data) });
  }
  catch (error) { return attendanceErrorResponse(error); }
}
