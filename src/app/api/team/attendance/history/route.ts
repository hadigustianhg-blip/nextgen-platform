import { attendanceHistoryQuerySchema, getAttendanceHistory } from "@/modules/attendance";
import { teamApiErrorResponse, teamJson } from "@/modules/team";
import { requireTeamAttendanceContext } from "../_access";

export async function GET(request: Request) {
  try {
    const context = await requireTeamAttendanceContext();
    const parsed = attendanceHistoryQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return teamJson({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 });
    return teamJson({ success: true, ...(await getAttendanceHistory(context, parsed.data)) });
  }
  catch (error) { return teamApiErrorResponse(error); }
}
