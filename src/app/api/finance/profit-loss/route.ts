import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  canReadProfitLoss, getProfitLoss, profitLossQuerySchema, profitLossScope,
} from "@/modules/profit-loss";

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
    if (!canReadProfitLoss(session)) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    const scope = profitLossScope(session);
    if (!scope) return NextResponse.json({ error: { code: "OUTLET_REQUIRED" } }, { status: 400 });
    const parsed = profitLossQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_QUERY", fields: parsed.error.flatten().fieldErrors } }, { status: 400 });
    return NextResponse.json({ data: await getProfitLoss(scope, parsed.data) }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    console.error("[PROFIT_LOSS_API]", error);
    return NextResponse.json({
      error: {
        code: "PROFIT_LOSS_FETCH_FAILED",
        message: "Data Profit Loss gagal dimuat.",
      },
    }, { status: 500 });
  }
}
