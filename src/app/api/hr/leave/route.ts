import { NextResponse } from "next/server";
import { adminLeaveQuerySchema, leaveErrorResponse, listAdminLeaveRequests } from "@/modules/leave";
import { requireLeaveAdmin } from "./_access";

export async function GET(request: Request) {
  try {
    const session = await requireLeaveAdmin("READ");
    const parsed = adminLeaveQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400 });
    return NextResponse.json({ success: true, ...(await listAdminLeaveRequests(session, parsed.data)) });
  } catch (error) { return leaveErrorResponse(error); }
}
