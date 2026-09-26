import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import type { TeamContext } from "@/lib/auth/session";
import {
  mergeCodListSources, parseOperationalDate, summarizeCodList, todayInJakarta,
  updateTeamCodChecklist, type CodListPackage, type CodListReader,
} from "./team-cod-list.service";

const instant = new Date("2026-09-26T01:00:00.000Z");
const dispatch = (waybillNo: string, courierNameRaw = "Employee A", settlementTypeRaw: string | null = "DFOD", freightAmount = 25_000, codValue = 0) => ({
  id: `d-${waybillNo}`, waybillNo, courierNameRaw, receiverName: `Receiver ${waybillNo}`,
  receiverAddress: `Address ${waybillNo}`, settlementTypeRaw, freightAmount, codValue,
  syncStatus: "NORMALIZED" as const, isActive: true, sourceRecordKey: `v2:dispatch:${waybillNo}`,
  sourceFetchedAt: instant, dispatchAt: instant, updatedAt: instant, createdAt: instant,
});
const accepted = new Set(["EMPLOYEE A"]);
const merge = (input: Partial<Parameters<typeof mergeCodListSources>[0]> = {}) => mergeCodListSources({
  dispatches: [], checklists: [], acceptedNames: accepted, ...input,
});
const item = (overrides: Partial<CodListPackage> = {}): CodListPackage => ({
  waybill: "WB", recipientName: null, address: null, type: "COD", amount: 100,
  method: null, checked: false, ...overrides,
});
const context: TeamContext = {
  userId: "u", tenantId: "tenant-a", tenantName: "Tenant", outletId: "outlet-a", outletCode: "SUM001A",
  membershipId: "membership-a", salaryEmployeeId: "employee-a", employeeName: "Employee A", employeeStatus: "ACTIVE",
};

function fakeClient(source = { dispatches: [dispatch("DFOD-1"), dispatch("COD-1", "Employee A", "TUNAI", 0, 50_000)], checklists: [] as Array<{ waybill: string; method: "CASH" | "TRANSFER" | null; checked: boolean }> }) {
  const state = [...source.checklists];
  const calls: unknown[] = [];
  const client = {
    rawDispatch: { findMany: vi.fn(async (args) => { calls.push(args); return source.dispatches; }) },
    employeeCodChecklist: {
      findMany: vi.fn(async (args) => { calls.push(args); return state; }),
      upsert: vi.fn(async (args: any) => {
        calls.push(args);
        const key = args.where.tenantId_outletId_employeeId_waybill_operationalDate;
        const index = state.findIndex((row) => row.waybill === key.waybill);
        const value = { waybill: key.waybill, ...args.update };
        if (index >= 0) state[index] = value; else state.push(value);
        return value;
      }),
    },
  };
  return { client: client as unknown as CodListReader, raw: client, state, calls };
}

describe("employee COD List", () => {
  it("shows every COD from canonical employee Delivery", () => expect(merge({ dispatches: [dispatch("COD-1", "Employee A", "TUNAI", 0, 50_000), dispatch("COD-2", "Employee A", null, 0, 60_000)] })).toMatchObject([{ waybill: "COD-1", type: "COD", amount: 50_000 }, { waybill: "COD-2", type: "COD", amount: 60_000 }]));
  it("shows DFOD from canonical active dispatch", () => expect(merge({ dispatches: [dispatch("DFOD-1")] })).toMatchObject([{ waybill: "DFOD-1", type: "DFOD", amount: 25_000 }]));
  it("shows multiple DFOD waybills", () => expect(merge({ dispatches: [dispatch("D1"), dispatch("D2")] })).toHaveLength(2));
  it("excludes non-COD/DFOD dispatch", () => expect(merge({ dispatches: [dispatch("REG-1", "Employee A", "TUNAI", 0, 0)] })).toEqual([]));
  it("does not depend on the partial RawCod dataset", () => expect(merge({ dispatches: [dispatch("C1", "Employee A", null, 0, 10), dispatch("C2", "Employee A", null, 0, 20), dispatch("C3", "Employee A", null, 0, 30)] })).toHaveLength(3));
  it("combines COD and DFOD without duplicate waybill", () => expect(merge({ dispatches: [dispatch("ONE", "Employee A", "DFOD", 25_000, 50_000)] })).toEqual([expect.objectContaining({ waybill: "ONE", type: "COD", amount: 50_000 })]));
  it("employee A sees only matching courier packages", () => expect(merge({ dispatches: [dispatch("A"), dispatch("B", "Employee B")] }).map((row) => row.waybill)).toEqual(["A"]));
  it("employee B cannot see employee A packages", () => expect(mergeCodListSources({ dispatches: [dispatch("A")], checklists: [], acceptedNames: new Set(["EMPLOYEE B"]) })).toEqual([]));
  it("canonical employee aliases are exact, not fuzzy", () => expect(mergeCodListSources({ dispatches: [dispatch("A", " Employee   A ")], checklists: [], acceptedNames: accepted })).toHaveLength(1));
  it("restores persisted checklist state after refresh", () => expect(merge({ dispatches: [dispatch("A")], checklists: [{ waybill: "A", method: "CASH", checked: true }] })[0]).toMatchObject({ method: "CASH", checked: true }));
  it("defaults packages without checklist to unchecked", () => expect(merge({ dispatches: [dispatch("A")] })[0]).toMatchObject({ method: null, checked: false }));
  it("does not count checked without a method as complete", () => expect(merge({ dispatches: [dispatch("A")], checklists: [{ waybill: "A", method: null, checked: true }] })[0].checked).toBe(false));
  it("counts CASH checked in cash", () => expect(summarizeCodList([item({ method: "CASH", checked: true })])).toMatchObject({ cash: 100, unfinished: 0 }));
  it("counts TRANSFER checked in transfer", () => expect(summarizeCodList([item({ method: "TRANSFER", checked: true })])).toMatchObject({ transfer: 100, unfinished: 0 }));
  it("counts unchecked in unfinished", () => expect(summarizeCodList([item()]).unfinished).toBe(100));
  it("keeps selected method but unchecked in unfinished", () => expect(summarizeCodList([item({ method: "CASH" })])).toMatchObject({ cash: 0, unfinished: 100 }));
  it("preserves total = cash + transfer + unfinished", () => { const s = summarizeCodList([item({ amount: 10, method: "CASH", checked: true }), item({ amount: 20, method: "TRANSFER", checked: true }), item({ amount: 30 })]); expect(s.total).toBe(s.cash + s.transfer + s.unfinished); });
  it("sorts unfinished before completed", () => expect(merge({ dispatches: [dispatch("DONE"), dispatch("TODO")], checklists: [{ waybill: "DONE", method: "CASH", checked: true }] }).map((row) => row.waybill)).toEqual(["TODO", "DONE"]));
  it("summary includes the entire eligible Delivery dataset", () => expect(summarizeCodList(merge({ dispatches: [dispatch("D", "Employee A", "DFOD", 25_000), dispatch("C1", "Employee A", null, 0, 50_000), dispatch("C2", "Employee A", null, 0, 75_000)] }))).toMatchObject({ total: 150_000, unfinished: 150_000, packageCount: 3 }));
  it("uses strict date-only semantics without UTC shift", () => expect(parseOperationalDate("2026-09-26").toISOString()).toBe("2026-09-26T00:00:00.000Z"));
  it("defaults today using Asia/Jakarta timezone", () => expect(todayInJakarta(new Date("2026-09-25T18:00:00Z"))).toBe("2026-09-26"));

  it.each(["CASH", "TRANSFER"] as const)("persists %s through scoped upsert", async (method) => {
    const store = fakeClient();
    const result = await updateTeamCodChecklist({ context, acceptedNames: accepted, businessDate: "2026-09-26", waybill: "COD-1", method, checked: true, client: store.client });
    expect(store.raw.employeeCodChecklist.upsert).toHaveBeenCalledOnce();
    expect(result.packages.find((row) => row.waybill === "COD-1")).toMatchObject({ method, checked: true });
  });
  it("rejects checked state without method before any write", async () => { const store = fakeClient(); await expect(updateTeamCodChecklist({ context, acceptedNames: accepted, businessDate: "2026-09-26", waybill: "COD-1", method: null, checked: true, client: store.client })).rejects.toMatchObject({ code: "CHECKLIST_METHOD_REQUIRED" }); expect(store.raw.employeeCodChecklist.upsert).not.toHaveBeenCalled(); });
  it("rejects manipulated or non-owned source waybill", async () => { const store = fakeClient(); await expect(updateTeamCodChecklist({ context, acceptedNames: accepted, businessDate: "2026-09-26", waybill: "EMPLOYEE-B-WB", method: "CASH", checked: false, client: store.client })).rejects.toMatchObject({ code: "COD_PACKAGE_NOT_FOUND" }); expect(store.raw.employeeCodChecklist.upsert).not.toHaveBeenCalled(); });
  it("scopes every read and write to canonical tenant, outlet, employee and date", async () => { const store = fakeClient(); await updateTeamCodChecklist({ context, acceptedNames: accepted, businessDate: "2026-09-26", waybill: "COD-1", method: "CASH", checked: false, client: store.client }); const text = JSON.stringify(store.calls); expect(text).toContain('"tenantId":"tenant-a"'); expect(text).toContain('"outletId":"outlet-a"'); expect(text).toContain('"employeeId":"employee-a"'); expect(text).not.toContain("tenant-b"); });
  it("uses upsert so repeated writes cannot create duplicate checklist rows", async () => { const store = fakeClient(); const input = { context, acceptedNames: accepted, businessDate: "2026-09-26", waybill: "COD-1", method: "CASH" as const, checked: true, client: store.client }; await updateTeamCodChecklist(input); await updateTeamCodChecklist(input); expect(store.state).toHaveLength(1); expect(store.raw.employeeCodChecklist.upsert).toHaveBeenCalledTimes(2); });
  it("isolates operational dates in canonical unique identity", async () => { const store = fakeClient(); await updateTeamCodChecklist({ context, acceptedNames: accepted, businessDate: "2026-09-25", waybill: "COD-1", method: "CASH", checked: false, client: store.client }); const args = store.raw.employeeCodChecklist.upsert.mock.calls[0][0] as any; expect(args.where.tenantId_outletId_employeeId_waybill_operationalDate.operationalDate.toISOString()).toBe("2026-09-25T00:00:00.000Z"); });
  it("mutation code writes only EmployeeCodChecklist, never operational sources", async () => { const source = await readFile(`${process.cwd()}/src/modules/team/team-cod-list.service.ts`, "utf8"); expect(source).not.toMatch(/raw(?:Cod|Dispatch|Pickup)\.(?:create|update|upsert|delete)/); expect(source).not.toMatch(/salaryClosing|cashMovement|pickupPayment/); });
  it("write API accepts no employeeId authority from the client", async () => { const source = await readFile(`${process.cwd()}/src/app/api/team/cod-list/route.ts`, "utf8"); expect(source).not.toMatch(/employeeId\s*:/); expect(source).toContain("resolveTeamContext(session)"); });
  it("migration is additive-only", async () => { const sql = await readFile(`${process.cwd()}/prisma/migrations/20260926000100_add_employee_cod_checklist/migration.sql`, "utf8"); expect(sql).toContain('CREATE TABLE "EmployeeCodChecklist"'); expect(sql).not.toMatch(/\bDROP\b|TRUNCATE|ALTER COLUMN|DROP COLUMN/i); });
});
