import { describe, expect, it } from "vitest";
import { redirectToLogin, redirectToPublicLogin } from "./redirect";

describe("relative auth redirects", () => {
  it("returns a relative login Location for logout", () => {
    const response = redirectToLogin({ status: 303 });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
    expect(response.headers.get("location")).not.toContain("0.0.0.0");
  });

  it("preserves the protected pathname without inheriting an internal origin", () => {
    const response = redirectToLogin({
      nextPath: "/dashboard/finance/salary closing",
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "/login?next=%2Fdashboard%2Ffinance%2Fsalary+closing",
    );
    expect(response.headers.get("location")).not.toMatch(/^https?:\/\//);
  });

  it("uses only the configured public URL when an absolute proxy redirect is required", () => {
    const response = redirectToPublicLogin({
      appUrl: "https://app.nextgen-platform.com",
      nextPath: "/dashboard",
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.nextgen-platform.com/login?next=%2Fdashboard",
    );
  });

  it("rejects missing or non-HTTP public app URLs", () => {
    expect(() => redirectToPublicLogin({ appUrl: undefined }))
      .toThrow("NEXT_PUBLIC_APP_URL is required");
    expect(() => redirectToPublicLogin({ appUrl: "javascript:alert(1)" }))
      .toThrow("NEXT_PUBLIC_APP_URL must use HTTP or HTTPS");
  });
});
