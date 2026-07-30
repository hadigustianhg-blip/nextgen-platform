import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { operationalScope } from "@/modules/operational-settlement";
import {
  canReadFinance, getOperationalDetailRows, getOperationalDetailSummary,
  operationalDetailQuerySchema,
} from "@/modules/finance";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!canReadFinance(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const scope = operationalScope(session);
  if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
  const parsed = operationalDetailQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR" } }, { status: 400 });
  const { category, page, pageSize, ...range } = parsed.data;
  if (category) return NextResponse.json(await getOperationalDetailRows({ ...scope, ...range, category, page, pageSize }));
  return NextResponse.json(await getOperationalDetailSummary({ ...scope, ...range }));
}
