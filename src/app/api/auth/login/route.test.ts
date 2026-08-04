import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock("@/modules/auth/auth.service", () => ({ login: mocks.login }));

import { POST } from "./route";

const request = () => new Request("http://localhost/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ tenant: "nextgen", email: "team@example.test", password: "password-valid-123" }),
});

describe("POST /api/auth/login role redirect", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["/team", "/dashboard"])("returns the service-authorized %s destination", async (redirectTo) => {
    mocks.login.mockResolvedValueOnce({ ok: true, redirectTo });
    const response = await POST(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { redirectTo } });
  });
});
