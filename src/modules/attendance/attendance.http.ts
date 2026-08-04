import { NextResponse } from "next/server";

export class AttendanceError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}

export function attendanceErrorResponse(error: unknown) {
  if (error instanceof AttendanceError) {
    return NextResponse.json({ success: false, error: { code: error.code } }, { status: error.status });
  }
  console.error("[ATTENDANCE_API]", { errorName: error instanceof Error ? error.name : "UnknownError" });
  return NextResponse.json({ success: false, error: { code: "ATTENDANCE_REQUEST_FAILED" } }, { status: 500 });
}
