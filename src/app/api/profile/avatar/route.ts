import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";
import { MAX_AVATAR_BYTES, ProfileError, profileErrorResponse, updateOwnAvatar } from "@/modules/profile";

const noStore = { "Cache-Control": "private, no-store, max-age=0" };
const MAX_MULTIPART_OVERHEAD = 64 * 1024;

function hasValidOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const expectedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!expectedHost) return false;
  try {
    return new URL(origin).host === expectedHost;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401, headers: noStore });
  if (!canAccessResource(session.roles, "USER_PROFILE", "UPDATE")) return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403, headers: noStore });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, error: { code: "INVALID_ORIGIN" } }, { status: 403, headers: noStore });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
    return NextResponse.json({ success: false, error: { code: "AVATAR_MULTIPART_REQUIRED" } }, { status: 415, headers: noStore });
  }
  const contentLength = Number(request.headers.get("content-length"));
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return NextResponse.json({ success: false, error: { code: "AVATAR_CONTENT_LENGTH_REQUIRED" } }, { status: 411, headers: noStore });
  }
  if (contentLength > MAX_AVATAR_BYTES + MAX_MULTIPART_OVERHEAD) {
    return NextResponse.json({ success: false, error: { code: "AVATAR_SIZE_INVALID" } }, { status: 413, headers: noStore });
  }
  try {
    const form = await request.formData();
    const file = form.get("avatar");
    if (!(file instanceof File)) throw new ProfileError("AVATAR_FILE_REQUIRED", 400);
    const profile = await updateOwnAvatar(session, file);
    return NextResponse.json({ success: true, data: profile }, { headers: noStore });
  } catch (error) {
    return profileErrorResponse(error);
  }
}
