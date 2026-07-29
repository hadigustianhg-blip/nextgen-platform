import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canReadOperational, listOperationalTeams, operationalScope } from "@/modules/operational-settlement";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const scope = operationalScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  if (!canReadOperational(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  return NextResponse.json({ data: await listOperationalTeams(scope) });
}
