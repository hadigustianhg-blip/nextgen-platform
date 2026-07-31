import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  assignSalaryProfile,
  canManageSalarySetting,
  salaryAssignmentSchema,
  salaryErrorResponse,
  salaryScope,
} from "@/modules/salary";

type Context = { params: Promise<{ employeeId: string }> };

export async function PATCH(request: Request, context: Context) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canManageSalarySetting(session)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const scope = salaryScope(session);
  if (!scope || !session.outletCode) {
    return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  }
  const parsed = salaryAssignmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({
      error: { code: "VALIDATION_ERROR", fields: parsed.error.flatten().fieldErrors },
    }, { status: 400 });
  }
  try {
    return NextResponse.json({ data: await assignSalaryProfile({
      tenantId: scope.tenantId,
      outletId: scope.outletId,
      actorId: session.userId,
      outletCode: session.outletCode,
    }, (await context.params).employeeId, parsed.data) });
  } catch (error) {
    return salaryErrorResponse(error);
  }
}
