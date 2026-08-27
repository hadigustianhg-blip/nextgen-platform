import { normalizeIndonesianPhone } from "@/modules/quality-control/problem-waybill-delivery-whatsapp";

export function buildTrackingWhatsAppUrl(phone: string | null | undefined) {
  const normalized = normalizeIndonesianPhone(phone);
  return normalized ? `https://wa.me/${normalized}` : null;
}
