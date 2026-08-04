import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSessionCookieName } from "@/lib/auth/constants";
import { proxy } from "./proxy";

describe("dashboard auth proxy", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("redirects unauthenticated internal-origin requests through the public app URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.nextgen-platform.com");
    const request = new NextRequest(
      "http://0.0.0.0:8080/dashboard/finance/salary-closing",
    );

    const response = proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.nextgen-platform.com/login?next=%2Fdashboard%2Ffinance%2Fsalary-closing",
    );
    expect(response.headers.get("location")).not.toContain("0.0.0.0:8080");
  });

  it("allows requests that still have the existing session cookie", () => {
    const request = new NextRequest("http://0.0.0.0:8080/dashboard", {
      headers: { cookie: `${getSessionCookieName()}=session-token` },
    });

    const response = proxy(request);

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });
});
