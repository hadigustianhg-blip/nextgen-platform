import { describe, expect, it } from "vitest";
import { isSameOriginRequest, pickupPaymentRequestPayload } from "./pickup-payment.http";

describe("pickup payment request protection", () => {
  it("accepts same-origin and rejects a foreign Origin", () => {
    expect(isSameOriginRequest(new Request("https://app.example.test/api/pickup-payment", {
      headers: { origin: "https://app.example.test" },
    }))).toBe(true);
    expect(isSameOriginRequest(new Request("https://app.example.test/api/pickup-payment", {
      headers: { origin: "https://evil.example.test" },
    }))).toBe(false);
  });

  it("keeps the proof separate from client-controlled payment fields", async () => {
    const form = new FormData();
    form.set("method", "TRANSFER");
    form.set("transferProofStorageKey", "arbitrary/key.webp");
    form.set("transferProof", new File(["image"], "proof.jpg", { type: "image/jpeg" }));
    const payload = await pickupPaymentRequestPayload(new Request("https://app.example.test/api/pickup-payment", {
      method: "POST", body: form,
    }));
    expect(payload.proof).toBeInstanceOf(File);
    expect(payload.values).not.toHaveProperty("transferProof");
  });
});
