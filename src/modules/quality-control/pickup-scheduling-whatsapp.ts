export type PickupMessageOrder = {
  waybill: string;
  source: string | null;
  goodsName: string | null;
};

export function normalizePickupPhone(value: string | null) {
  if (!value) return null;
  let digits = value.replace(/[^\d]/g, "");
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
  const customer = input.customerName?.trim() || "kak";
  const outlet = input.outletCode?.trim() || "";
  const brand = outlet ? `JNT CARGO ${outlet}` : "JNT CARGO";
  const orderText = input.orders.map((order) => [
    order.waybill,
    `${order.source?.trim() || "JFS"} Pickup`,
    order.goodsName?.trim() || null,
  ].filter(Boolean).join("\n")).join("\n\n");
  return `Hallo kak ${customer}\n\nSaya dari ${brand}, izin konfirmasi penjadwalan pickup :\n\n${orderText}\n\nUntuk barang diatas apa sudah ready di pickup? Jika sudah team lapangan akan segera melakukan penjemputan ke lokasi kaka.\n\nDitunggu ya kak responnya, terimakasih 🙏`;
}

export function buildPickupWhatsAppUrl(phone: string | null, message: string) {
  const normalized = normalizePickupPhone(phone);
  return normalized ? `https://wa.me/${normalized}?text=${encodeURIComponent(message)}` : null;
}
