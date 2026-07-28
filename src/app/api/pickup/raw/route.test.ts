import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn(async () => null) }));
vi.mock("@/modules/pickup", () => ({ listRawPickups: vi.fn() }));

import { GET } from "./route";

describe("GET /api/pickup/raw", () => {
  it("rejects a request without session", async () => {
    const response = await GET(new Request("http://localhost/api/pickup/raw"));
    expect(response.status).toBe(401);
  });
});
