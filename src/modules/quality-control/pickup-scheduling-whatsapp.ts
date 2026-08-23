export type PickupMessageOrder = {
  waybill: string;
  source: string | null;
  goodsName: string | null;
};

export function normalizePickupPhone(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  const plusCount = (trimmed.match(/\+/g) || []).length;
  if (!trimmed || !/^[+\d\s()\-]+$/.test(trimmed) || plusCount > 1
    || (plusCount === 1 && !trimmed.startsWith("+") && !trimmed.startsWith("(+"))) return null;
  let digits = trimmed.replace(/[\s()\-+]/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;
  if (!/^628\d{7,12}$/.test(digits)) return null;
  return digits;
}

export function buildPickupMessage(input: {
  customerName: string | null;
  outletCode: string | null;
  orders: PickupMessageOrder[];
}) {
  const customer = input.customerName?.trim();
  const greeting = customer ? `Hallo kak ${customer}` : "Hallo kak";
  const outlet = input.outletCode?.trim() || "";
  const brand = outlet ? `JNT CARGO ${outlet}` : "JNT CARGO";
  const uniqueOrders = [...new Map(input.orders
    .map((order) => [order.waybill.trim(), order] as const)
    .filter(([waybill]) => Boolean(waybill))).values()];
  const orderText = uniqueOrders.map((order) => [
    order.waybill,
    formatPickupSource(order.source),
    order.goodsName?.trim() || null,
  ].filter(Boolean).join("\n")).join("\n\n");
  return `${greeting}\n\nSaya dari ${brand}, izin konfirmasi penjadwalan pickup :\n\n${orderText}\n\nUntuk barang diatas apa sudah ready di pickup? Jika sudah team lapangan akan segera melakukan penjemputan ke lokasi kaka.\n\nDitunggu ya kak responnya, terimakasih 🙏`;
}

function formatPickupSource(source: string | null) {
  const value = source?.trim();
  if (!value) return "Pickup";
  const display = value === value.toLowerCase()
    ? value.replace(/(^|[\s_-])([a-z])/g, (_, separator: string, letter: string) => `${separator}${letter.toUpperCase()}`)
    : value;
  return `${display} Pickup`;
}

export function buildPickupWhatsAppUrl(phone: string | null, message: string) {
  const normalized = normalizePickupPhone(phone);
  return normalized ? `https://wa.me/${normalized}?text=${encodeURIComponent(message)}` : null;
}
