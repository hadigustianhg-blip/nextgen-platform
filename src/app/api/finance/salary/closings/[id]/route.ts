import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canReadSalaryClosing,
  getSalaryClosing,
  salaryScope,
} from "@/modules/salary";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canReadSalaryClosing(session)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const scope = salaryScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  const data = await getSalaryClosing(scope, (await context.params).id);
  return data
    ? NextResponse.json({ data })
    : NextResponse.json({ error: { code: "SALARY_CLOSING_NOT_FOUND" } }, { status: 404 });
}
