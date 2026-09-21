import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), canManage: vi.fn(), ignore: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/modules/salary", async () => {
  const actual = await vi.importActual<typeof import("@/modules/salary")>("@/modules/salary");
  return {
    ...actual,
    canManageSalaryClosing: mocks.canManage,
    salaryScope: () => ({ tenantId: "tenant-1", outletId: "outlet-1" }),
    ignoreSalaryClosingSources: mocks.ignore,
  };
});

import { POST } from "./route";

const sourceId = "11111111-1111-4111-8111-111111111111";
const request = (body: unknown) => new Request("http://localhost/ignore", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
const routeContext = { params: Promise.resolve({ id: "closing-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({
    tenantId: "tenant-1", outletId: "outlet-1", outletCode: "SUM001A",
    userId: "user-1", roles: ["OWNER"],
  });
  mocks.canManage.mockReturnValue(true);
  mocks.ignore.mockResolvedValue({ ignored: 1, pickup: 1, dispatch: 0, remaining: 0 });
});

describe("POST bulk ignore Salary Closing sources", () => {
  it("passes canonical source IDs, reason, and session scope", async () => {
    const body = { sourceIds: [sourceId], reason: "Part-time harian" };
    const response = await POST(request(body), routeContext);
    expect(response.status).toBe(200);
    expect(mocks.ignore).toHaveBeenCalledWith({
      tenantId: "tenant-1", outletId: "outlet-1", outletCode: "SUM001A", actorId: "user-1",
    }, "closing-1", body);
  });

  it.each([
    [{ sourceIds: [], reason: "Part-time harian" }],
    [{ sourceIds: [sourceId, sourceId], reason: "Part-time harian" }],
    [{ sourceIds: [sourceId], reason: "x" }],
  ])("rejects invalid or duplicate identifiers", async (body) => {
    const response = await POST(request(body), routeContext);
    expect(response.status).toBe(400);
    expect(mocks.ignore).not.toHaveBeenCalled();
  });
});
