import { NextResponse } from "next/server";
import { approveLeaveRequest, leaveApproveSchema, leaveErrorResponse } from "@/modules/leave";
import { requireLeaveAdmin } from "../../_access";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireLeaveAdmin("APPROVE");
    const parsed = leaveApproveSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 });
    return NextResponse.json({ success: true, data: await approveLeaveRequest(session, (await context.params).id, parsed.data.reviewNotes) });
  } catch (error) { return leaveErrorResponse(error); }
}
