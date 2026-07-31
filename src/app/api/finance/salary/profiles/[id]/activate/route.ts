import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  activateSalaryProfile,
  canManageSalarySetting,
  salaryErrorResponse,
  salaryScope,
} from "@/modules/salary";

type Context = { params: Promise<{ id: string }> };

export async function POST(_: Request, context: Context) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canManageSalarySetting(session)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const scope = salaryScope(session);
  if (!scope || !session.outletCode) {
    return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  }
  try {
    return NextResponse.json({ data: await activateSalaryProfile({
      tenantId: scope.tenantId,
      outletId: scope.outletId,
      actorId: session.userId,
      outletCode: session.outletCode,
    }, (await context.params).id) });
  } catch (error) {
    return salaryErrorResponse(error);
  }
}
