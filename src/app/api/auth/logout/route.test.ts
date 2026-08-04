import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAnySession: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getAnySession: mocks.getAnySession }));
vi.mock("@/modules/auth/auth.service", () => ({ logout: mocks.logout }));

import { POST } from "./route";

describe("POST /api/auth/logout", () => {
  beforeEach(() => vi.clearAllMocks());

  it("revokes the current session and redirects to a relative login path", async () => {
    const session = { sessionId: "session-1", userId: "user-1" };
    mocks.getAnySession.mockResolvedValueOnce(session);

    const response = await POST();

    expect(mocks.logout).toHaveBeenCalledWith(session);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
  });

  it("keeps logout idempotent when the session is already absent", async () => {
    mocks.getAnySession.mockResolvedValueOnce(null);

    const response = await POST();

    expect(mocks.logout).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
  });
});

