import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { operationalScope } from "@/modules/operational-settlement";
import {
  financeRangeSchema,
  JfsCashflowError,
  readJfsCashflow,
  runJfsCashflowSync,
} from "@/modules/finance";
import { canManageProfitLoss, canReadProfitLoss } from "@/modules/profit-loss";

const noStore = { "Cache-Control": "private, no-store, max-age=0" };

type RouteContext =
  | { response: NextResponse; session?: never; scope?: never }
  | {
      response?: never;
      session: NonNullable<Awaited<ReturnType<typeof getSession>>>;
      scope: { tenantId: string; outletId: string };
    };

async function context(action: "READ" | "MANAGE" = "READ"): Promise<RouteContext> {
  const session = await getSession();
  if (!session) return { response: NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 }) };
  if (action === "READ" ? !canReadProfitLoss(session) : !canManageProfitLoss(session)) return { response: NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 }) };
  const scope = operationalScope(session);
  if (!scope) return { response: NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 }) };
  return { session, scope };
}

export async function GET(request: Request) {
  const auth = await context();
  if (auth.response) return auth.response;
  const parsed = financeRangeSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_DATE_RANGE" } }, { status: 400 });
  return NextResponse.json(await readJfsCashflow({ ...auth.scope, ...parsed.data }), { headers: noStore });
}

export async function POST(request: Request) {
  const auth = await context("MANAGE");
  if (auth.response) return auth.response;
  const parsed = financeRangeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_DATE_RANGE" } }, { status: 400 });
  try {
    const sync = await runJfsCashflowSync({
      ...auth.scope,
      ...parsed.data,
      actorId: auth.session.userId,
      triggerSource: "MANUAL",
    });
    const result = await readJfsCashflow({ ...auth.scope, ...parsed.data });
    return NextResponse.json({ ...result, sync }, { headers: noStore });
  } catch (error) {
    const code = error instanceof JfsCashflowError ? error.code : "SOURCE_UNAVAILABLE";
    return NextResponse.json(
      { error: { code } },
      { status: code === "ALREADY_RUNNING" ? 409 : code === "MIDDLEWARE_NOT_CONFIGURED" ? 500 : 502 },
    );
  }
}
