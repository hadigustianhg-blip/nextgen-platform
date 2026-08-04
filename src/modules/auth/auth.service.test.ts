import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  createSession: vi.fn(),
  writeAudit: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("argon2", () => ({ default: { verify: mocks.verify } }));
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => null }) }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: { findFirst: mocks.findFirst, update: mocks.update } },
}));
vi.mock("@/lib/auth/session", () => ({
  createUserSession: mocks.createSession,
  revokeCurrentSession: vi.fn(),
}));
vi.mock("@/lib/audit/write-audit", () => ({ writeAudit: mocks.writeAudit }));

import { login } from "./auth.service";

describe("login destination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue(true);
    mocks.update.mockResolvedValue({});
    mocks.createSession.mockResolvedValue(undefined);
    mocks.writeAudit.mockResolvedValue(undefined);
  });

  it.each([
    [[{ role: { code: "TEAM" } }], "/team"],
    [[{ role: { code: "ADMIN" } }], "/dashboard"],
  ] as const)("derives redirect from server-side roles", async (roles, redirectTo) => {
    mocks.findFirst.mockResolvedValueOnce({
      id: "user-1", tenantId: "tenant-1", outletId: "outlet-1",
      passwordHash: "stored-hash", roles,
    });
    await expect(login({ tenant: "tenant", email: "user@example.test", password: "password-valid-123" }))
      .resolves.toMatchObject({ ok: true, redirectTo });
    expect(mocks.createSession).toHaveBeenCalledWith({
      tenantId: "tenant-1", userId: "user-1", outletId: "outlet-1",
    });
  });
});
