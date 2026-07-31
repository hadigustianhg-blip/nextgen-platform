import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canManageSalarySetting,
  canReadSalarySetting,
  getSalaryProfile,
  salaryErrorResponse,
  salaryProfileSchema,
  salaryScope,
  updateSalaryProfile,
} from "@/modules/salary";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canReadSalarySetting(session)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const scope = salaryScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  const data = await getSalaryProfile(scope, (await context.params).id);
  return data
    ? NextResponse.json({ data })
    : NextResponse.json({ error: { code: "SALARY_PROFILE_NOT_FOUND" } }, { status: 404 });
}

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
  const parsed = salaryProfileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({
      error: { code: "VALIDATION_ERROR", fields: parsed.error.flatten().fieldErrors },
    }, { status: 400 });
  }
  try {
    return NextResponse.json({ data: await updateSalaryProfile({
      tenantId: scope.tenantId,
      outletId: scope.outletId,
      actorId: session.userId,
      outletCode: session.outletCode,
    }, (await context.params).id, parsed.data) });
  } catch (error) {
    return salaryErrorResponse(error);
  }
}
