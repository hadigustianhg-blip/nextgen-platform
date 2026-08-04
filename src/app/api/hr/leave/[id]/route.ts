import { NextResponse } from "next/server";
import { getAdminLeaveRequest, leaveErrorResponse } from "@/modules/leave";
import { requireLeaveAdmin } from "../_access";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json({ success: true, data: await getAdminLeaveRequest(await requireLeaveAdmin("READ"), (await context.params).id) }); }
  catch (error) { return leaveErrorResponse(error); }
}
