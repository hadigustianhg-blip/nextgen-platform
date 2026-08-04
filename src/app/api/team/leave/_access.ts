import { getAnySession, resolveTeamContext } from "@/lib/auth/session";
import { LeaveError } from "@/modules/leave";

export async function requireTeamLeaveContext() {
  const session = await getAnySession();
  if (!session) throw new LeaveError("UNAUTHORIZED", 401);
  try { return await resolveTeamContext(session); }
  catch { throw new LeaveError("FORBIDDEN", 403); }
}
