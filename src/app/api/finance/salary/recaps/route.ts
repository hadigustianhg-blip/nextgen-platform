import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canReadSalaryRecap,
  listSalaryRecaps,
  salaryScope,
} from "@/modules/salary";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canReadSalaryRecap(session)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const scope = salaryScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  return NextResponse.json({ data: await listSalaryRecaps(scope) });
}
