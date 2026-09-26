import { z } from "zod";
import { getAnySession, resolveTeamContext } from "@/lib/auth/session";
import { resolveTeamAcceptedCourierNames, teamApiErrorResponse, teamJson } from "@/modules/team";
import { getTeamCodList, todayInJakarta, updateTeamCodChecklist } from "@/modules/team/team-cod-list.service";

const noStore = { "Cache-Control": "private, no-store, max-age=0" };
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const updateSchema = z.object({
  operationalDate: dateSchema,
  waybill: z.string().trim().min(1).max(100),
  method: z.enum(["CASH", "TRANSFER"]).nullable(),
  checked: z.boolean(),
}).strict();

async function teamScope() {
  const session = await getAnySession();
  if (!session) return null;
  const context = await resolveTeamContext(session);
  const acceptedNames = await resolveTeamAcceptedCourierNames(context);
  return { context, acceptedNames };
}

export async function GET(request: Request) {
  try {
    const scope = await teamScope();
    if (!scope) return teamJson({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401, headers: noStore });
    if (!scope.acceptedNames.size) return teamJson({ success: false, error: { code: "TEAM_EMPLOYEE_NOT_FOUND" } }, { status: 404, headers: noStore });
    const requested = new URL(request.url).searchParams.get("date") ?? todayInJakarta();
    if (!dateSchema.safeParse(requested).success) return teamJson({ success: false, error: { code: "INVALID_OPERATIONAL_DATE" } }, { status: 400, headers: noStore });
    const data = await getTeamCodList({ ...scope, businessDate: requested });
    return teamJson({ success: true, data }, { headers: noStore });
  } catch (error) {
    return teamApiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const scope = await teamScope();
    if (!scope) return teamJson({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401, headers: noStore });
    if (!scope.acceptedNames.size) return teamJson({ success: false, error: { code: "TEAM_EMPLOYEE_NOT_FOUND" } }, { status: 404, headers: noStore });
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) return teamJson({ success: false, error: { code: "INVALID_REQUEST" } }, { status: 400, headers: noStore });
    const data = await updateTeamCodChecklist({
      ...scope,
      businessDate: parsed.data.operationalDate,
      waybill: parsed.data.waybill,
      method: parsed.data.method,
      checked: parsed.data.checked,
    });
    return teamJson({ success: true, data }, { headers: noStore });
  } catch (error) {
    return teamApiErrorResponse(error);
  }
}
