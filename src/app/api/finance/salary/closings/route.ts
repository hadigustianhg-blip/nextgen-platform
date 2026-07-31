import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canManageSalaryClosing,
  canReadSalaryClosing,
  createSalaryClosing,
  listSalaryClosings,
  salaryClosingSchema,
  salaryErrorResponse,
  salaryScope,
} from "@/modules/salary";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canReadSalaryClosing(session)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const scope = salaryScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  return NextResponse.json({ data: await listSalaryClosings(scope) });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canManageSalaryClosing(session)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const scope = salaryScope(session);
  if (!scope || !session.outletCode) {
    return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  }
  const parsed = salaryClosingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({
      error: { code: "VALIDATION_ERROR", fields: parsed.error.flatten().fieldErrors },
    }, { status: 400 });
  }
  try {
    return NextResponse.json({ data: await createSalaryClosing({
      tenantId: scope.tenantId,
      outletId: scope.outletId,
      actorId: session.userId,
      outletCode: session.outletCode,
    }, parsed.data) }, { status: 201 });
  } catch (error) {
    return salaryErrorResponse(error);
  }
}
