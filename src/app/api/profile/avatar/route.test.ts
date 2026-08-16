import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canAccessResource: vi.fn(() => true),
  updateOwnAvatar: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/permissions", () => ({ canAccessResource: mocks.canAccessResource }));
vi.mock("@/modules/profile", () => ({
  MAX_AVATAR_BYTES: 5 * 1024 * 1024,
  ProfileError: class ProfileError extends Error {
    constructor(public code: string, public status: number) { super(code); }
  },
  profileErrorResponse: (error: { code?: string; status?: number }) => NextResponse.json(
    { success: false, error: { code: error.code ?? "PROFILE_REQUEST_FAILED" } },
    { status: error.status ?? 500 },
  ),
  updateOwnAvatar: mocks.updateOwnAvatar,
}));

import { POST } from "./route";

const session = { userId: "user-id", tenantId: "tenant-id", outletId: "outlet-id", roles: ["OWNER"] };

describe("POST /api/profile/avatar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated uploads", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(new Request("https://app.example.test/api/profile/avatar", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(mocks.updateOwnAvatar).not.toHaveBeenCalled();
  });

  it("rejects oversized requests before parsing multipart data", async () => {
    mocks.getSession.mockResolvedValue(session);
    const response = await POST(new Request("https://app.example.test/api/profile/avatar", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x", "content-length": String(6 * 1024 * 1024) },
    }));
    expect(response.status).toBe(413);
    expect(mocks.updateOwnAvatar).not.toHaveBeenCalled();
  });

  it("passes only session identity and the uploaded file to the service", async () => {
    mocks.getSession.mockResolvedValue(session);
    mocks.updateOwnAvatar.mockResolvedValue({ avatarUrl: "https://cdn.example.test/new.webp" });
    const form = new FormData();
    form.set("avatar", new File(["image"], "avatar.jpg", { type: "image/jpeg" }));
    form.set("userId", "other-user");
    const response = await POST(new Request("https://app.example.test/api/profile/avatar", {
      method: "POST",
      body: form,
      headers: { "content-length": "1024" },
    }));
    expect(response.status).toBe(200);
    expect(mocks.updateOwnAvatar).toHaveBeenCalledWith(session, expect.any(File));
    expect(mocks.updateOwnAvatar).toHaveBeenCalledTimes(1);
  });

  it("contains no Team PWA integration", async () => {
    const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/teamMembership|\/api\/team|TeamContext/);
  });
});
