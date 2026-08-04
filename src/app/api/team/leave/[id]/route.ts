import { getOwnLeaveRequest } from "@/modules/leave";
import { teamApiErrorResponse, teamJson } from "@/modules/team";
import { requireTeamLeaveContext } from "../_access";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { return teamJson({ success: true, data: await getOwnLeaveRequest(await requireTeamLeaveContext(), (await context.params).id) }); }
  catch (error) { return teamApiErrorResponse(error); }
}
