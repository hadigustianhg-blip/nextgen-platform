import { NextResponse } from "next/server";

const forbiddenTerms = [
  "salary",
  "gross",
  "net",
  "bonus",
  "incentive",
  "allowance",
  "payroll",
  "salaryclosing",
  "salaryrecap",
  "salarysnapshot",
  "publication",
  "salarypublication",
  "salarycard",
  "slipgaji",
] as const;

const normalized = (value: string) => value.replace(/[^a-z]/gi, "").toLowerCase();

export function assertTeamDataIsolation(value: unknown, path = "response"): void {
  if (typeof value === "string") {
    const text = normalized(value);
    if (forbiddenTerms.some((term) => text.includes(term))) throw new Error(`TEAM_DATA_ISOLATION_VIOLATION:${path}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertTeamDataIsolation(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    const keyText = normalized(key);
    if (forbiddenTerms.some((term) => keyText.includes(term))) throw new Error(`TEAM_DATA_ISOLATION_VIOLATION:${path}.${key}`);
    assertTeamDataIsolation(item, `${path}.${key}`);
  }
}

export function teamJson(payload: unknown, init?: ResponseInit) {
  assertTeamDataIsolation(payload);
  return NextResponse.json(payload, init);
}

export function teamApiErrorResponse(error: unknown) {
  const known = error as { code?: unknown; status?: unknown };
  if (typeof known?.code === "string" && typeof known.status === "number") {
    return teamJson({ success: false, error: { code: known.code } }, { status: known.status });
  }
  console.error("[TEAM_API]", { errorName: error instanceof Error ? error.name : "UnknownError" });
  return teamJson({ success: false, error: { code: "TEAM_REQUEST_FAILED" } }, { status: 500 });
}
