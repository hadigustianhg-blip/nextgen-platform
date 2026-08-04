import { NextResponse } from "next/server";
import { ProfileError } from "./profile.service";

export function profileErrorResponse(error: unknown) {
  if (error instanceof ProfileError) {
    return NextResponse.json({
      success: false,
      error: { code: error.code },
    }, { status: error.status });
  }
  console.error("[PROFILE_API]", {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
  return NextResponse.json({
    success: false,
    error: { code: "PROFILE_REQUEST_FAILED" },
  }, { status: 500 });
}
