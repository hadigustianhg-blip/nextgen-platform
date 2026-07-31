import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canManageSalaryClosing,
  salaryClosingVoidSchema,
  salaryErrorResponse,
  salaryScope,
  voidSalaryClosing,
} from "@/modules/salary";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canManageSalaryClosing(session)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const scope = salaryScope(session);
  if (!scope || !session.outletCode) {
    return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  }
  const parsed = salaryClosingVoidSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  }
  try {
    return NextResponse.json({ data: await voidSalaryClosing({
      ...scope,
      actorId: session.userId,
      outletCode: session.outletCode,
    }, (await context.params).id, parsed.data.reason) });
  } catch (error) {
    return salaryErrorResponse(error);
  }
}
