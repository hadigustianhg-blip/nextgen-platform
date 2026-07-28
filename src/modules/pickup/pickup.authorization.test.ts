import { describe, expect, it } from "vitest";
import type { SessionContext } from "@/lib/auth/session";
import { canReadPickup, canSyncPickup, pickupScope } from "./pickup.authorization";

function session(roles: string[], outletId: string | null = "outlet-a"): SessionContext {
  return {
    sessionId: "session",
    tenantId: "tenant-a",
    tenantName: "Tenant",
    userId: "user",
    userName: "User",
    email: "user@example.test",
    outletId,
    outletCode: outletId ? "OUTLET" : null,
    roles,
  };
}

describe("pickup authorization", () => {
  it("allows operational sync and viewer read-only access", () => {
    expect(canSyncPickup(session(["OPERATIONAL"]))).toBe(true);
    expect(canReadPickup(session(["VIEWER"]))).toBe(true);
    expect(canSyncPickup(session(["VIEWER"]))).toBe(false);
  });

  it("requires an active outlet scope", () => {
    expect(pickupScope(session(["ADMIN"], null))).toBeNull();
  });
});
