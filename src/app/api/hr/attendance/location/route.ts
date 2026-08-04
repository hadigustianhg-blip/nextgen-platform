import { NextResponse } from "next/server";
import { attendanceErrorResponse, attendanceLocationSettingSchema, getAttendanceLocation, updateAttendanceLocation } from "@/modules/attendance";
import { requireAttendanceAdmin } from "../_access";

export async function GET() {
  try { return NextResponse.json({ success: true, data: await getAttendanceLocation(await requireAttendanceAdmin("READ")) }); }
  catch (error) { return attendanceErrorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    const session = await requireAttendanceAdmin("UPDATE");
    const parsed = attendanceLocationSettingSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 });
    return NextResponse.json({ success: true, data: await updateAttendanceLocation(session, parsed.data) });
  }
  catch (error) { return attendanceErrorResponse(error); }
}
