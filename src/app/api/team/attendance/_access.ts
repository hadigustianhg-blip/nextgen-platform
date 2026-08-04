import { getAnySession, resolveTeamContext } from "@/lib/auth/session";
import { AttendanceError } from "@/modules/attendance";

export async function requireTeamAttendanceContext() {
  const session = await getAnySession();
  if (!session) throw new AttendanceError("UNAUTHORIZED", 401);
  try { return await resolveTeamContext(session); }
  catch { throw new AttendanceError("FORBIDDEN", 403); }
}
