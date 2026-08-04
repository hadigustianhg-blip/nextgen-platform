import { getTodayAttendance } from "@/modules/attendance";
import { teamApiErrorResponse, teamJson } from "@/modules/team";
import { requireTeamAttendanceContext } from "../_access";

export async function GET() {
  try { return teamJson({ success: true, data: await getTodayAttendance(await requireTeamAttendanceContext()) }); }
  catch (error) { return teamApiErrorResponse(error); }
}
