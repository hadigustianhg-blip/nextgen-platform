import { describe, expect, it } from "vitest";
import { buildTrackingWhatsAppUrl } from "./waybill-tracking-whatsapp";

describe("tracking receiver WhatsApp URL", () => {
  it.each([
    ["081234567890", "https://wa.me/6281234567890"],
    ["81234567890", "https://wa.me/6281234567890"],
    ["+6281234567890", "https://wa.me/6281234567890"],
    ["6281234567890", "https://wa.me/6281234567890"],
  ])("normalizes %s without a prefilled message", (phone, expected) => {
    expect(buildTrackingWhatsAppUrl(phone)).toBe(expected);
  });

  it.each([null, undefined, "", "abc", "08123"])("rejects malformed phone %s", (phone) => {
    expect(buildTrackingWhatsAppUrl(phone)).toBeNull();
  });
});
