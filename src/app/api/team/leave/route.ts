import { createOwnLeaveRequest, leaveCreateSchema, listOwnLeaveRequests, teamLeaveQuerySchema } from "@/modules/leave";
import { teamApiErrorResponse, teamJson } from "@/modules/team";
import { requireTeamLeaveContext } from "./_access";

export async function GET(request: Request) {
  try {
    const context = await requireTeamLeaveContext();
    const parsed = teamLeaveQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return teamJson({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 });
    return teamJson({ success: true, ...(await listOwnLeaveRequests(context, parsed.data)) });
  } catch (error) { return teamApiErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const context = await requireTeamLeaveContext();
    const parsed = leaveCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return teamJson({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 });
    return teamJson({ success: true, data: await createOwnLeaveRequest(context, parsed.data) }, { status: 201 });
  } catch (error) { return teamApiErrorResponse(error); }
}
