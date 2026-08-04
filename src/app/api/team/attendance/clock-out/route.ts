import { attendanceLocationInputSchema, clockOut } from "@/modules/attendance";
import { teamApiErrorResponse, teamJson } from "@/modules/team";
import { requireTeamAttendanceContext } from "../_access";

export async function POST(request: Request) {
  try {
    const context = await requireTeamAttendanceContext();
    const parsed = attendanceLocationInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return teamJson({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 });
    return teamJson({ success: true, data: await clockOut(context, parsed.data) });
  }
  catch (error) { return teamApiErrorResponse(error); }
}
