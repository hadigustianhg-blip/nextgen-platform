import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canAccessResource } from "@/lib/permissions";
import {
  ownPasswordUpdateSchema,
  profileErrorResponse,
  updateOwnPassword,
} from "@/modules/profile";

const noStore = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401, headers: noStore });
  if (!canAccessResource(session.roles, "USER_PROFILE", "UPDATE")) return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403, headers: noStore });
  const parsed = ownPasswordUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", fieldErrors: parsed.error.flatten().fieldErrors } }, { status: 400, headers: noStore });
  try {
    return NextResponse.json(await updateOwnPassword(session, parsed.data), { headers: noStore });
  } catch (error) {
    return profileErrorResponse(error);
  }
}
