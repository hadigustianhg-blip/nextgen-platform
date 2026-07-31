import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canManageSalarySetting,
  canReadSalarySetting,
  createSalaryProfile,
  listSalaryProfiles,
  salaryErrorResponse,
  salaryProfileSchema,
  salaryScope,
} from "@/modules/salary";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canReadSalarySetting(session)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const scope = salaryScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  return NextResponse.json({ data: await listSalaryProfiles(scope) });
}

export async function POST(request: Request) {
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
    const data = await createSalaryProfile({
      tenantId: scope.tenantId,
      outletId: scope.outletId,
      actorId: session.userId,
      outletCode: session.outletCode,
    }, parsed.data);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return salaryErrorResponse(error);
  }
}
