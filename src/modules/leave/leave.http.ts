import { NextResponse } from "next/server";

export class LeaveError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}

export function leaveErrorResponse(error: unknown) {
  if (error instanceof LeaveError) {
    return NextResponse.json({ success: false, error: { code: error.code } }, { status: error.status });
  }
  console.error("[LEAVE_API]", { errorName: error instanceof Error ? error.name : "UnknownError" });
  return NextResponse.json({ success: false, error: { code: "LEAVE_REQUEST_FAILED" } }, { status: 500 });
}
