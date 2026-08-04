import { getSession } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";
import { AttendanceError } from "@/modules/attendance";

export async function requireAttendanceAdmin(action: "READ" | "UPDATE" = "READ") {
  const session = await getSession();
  if (!session) throw new AttendanceError("UNAUTHORIZED", 401);
  if (!canAccessResource(session.roles, "ATTENDANCE", action)) throw new AttendanceError("FORBIDDEN", 403);
  return session;
}
