import { getAnySession, resolveTeamContext } from "@/lib/auth/session";
import { ownPasswordUpdateSchema, ProfileError, updateOwnPassword } from "@/modules/profile";
import { teamApiErrorResponse, teamJson } from "@/modules/team";

const noStore = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(request: Request) {
  try {
    const session = await getAnySession();
    if (!session) return teamJson({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401, headers: noStore });
    await resolveTeamContext(session);
    const parsed = ownPasswordUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return teamJson({ success: false, error: { code: "VALIDATION_ERROR" } }, { status: 400, headers: noStore });
    return teamJson(await updateOwnPassword(session, parsed.data), { headers: noStore });
  } catch (error) {
    if (error instanceof ProfileError) return teamJson({ success: false, error: { code: error.code } }, { status: error.status, headers: noStore });
    return teamApiErrorResponse(error);
  }
}
