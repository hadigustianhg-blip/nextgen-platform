import { NextResponse } from "next/server";
import { leaveErrorResponse, leaveRejectSchema, rejectLeaveRequest } from "@/modules/leave";
import { requireLeaveAdmin } from "../../_access";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireLeaveAdmin("APPROVE");
    const parsed = leaveRejectSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 });
    return NextResponse.json({ success: true, data: await rejectLeaveRequest(session, (await context.params).id, parsed.data.reviewNotes) });
  } catch (error) { return leaveErrorResponse(error); }
}
