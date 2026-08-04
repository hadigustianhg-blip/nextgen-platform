import { NextResponse } from "next/server";
import { attendanceCorrectionSchema, attendanceErrorResponse, correctAttendance } from "@/modules/attendance";
import { requireAttendanceAdmin } from "../../_access";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAttendanceAdmin("UPDATE");
    const parsed = attendanceCorrectionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 });
    return NextResponse.json({ success: true, data: await correctAttendance(session, (await context.params).id, parsed.data) });
  }
  catch (error) { return attendanceErrorResponse(error); }
}
