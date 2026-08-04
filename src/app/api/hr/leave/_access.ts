import { getAnySession } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";
import { LeaveError } from "@/modules/leave";

export async function requireLeaveAdmin(action: "READ" | "APPROVE" = "READ") {
  const session = await getAnySession();
  if (!session) throw new LeaveError("UNAUTHORIZED", 401);
  if (!canAccessResource(session.roles, "LEAVE_MANAGEMENT", action)) throw new LeaveError("FORBIDDEN", 403);
  return session;
}
