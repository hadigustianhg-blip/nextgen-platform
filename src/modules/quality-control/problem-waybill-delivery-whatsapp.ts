export function normalizeIndonesianPhone(value: string | null | undefined) {
  if (!value) return null;
  const digits = value.replace(/[+\s()-]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  const normalized = digits.startsWith("0")
    ? `62${digits.slice(1)}`
    : digits.startsWith("8")
      ? `62${digits}`
      : digits;
  return /^628\d{8,12}$/.test(normalized) ? normalized : null;
}

export function buildProblemWaybillWhatsAppUrl(input: {
  receiverName: string | null;
  receiverPhone: string;
  waybill: string;
}) {
  const phone = normalizeIndonesianPhone(input.receiverPhone);
  if (!phone) return null;
  const salutation = input.receiverName?.trim() || "Bapak/Ibu";
  const message = `Halo Bapak/Ibu ${salutation},

Kami dari J&T Cargo ingin melakukan verifikasi terkait pengiriman dengan nomor resi:

${input.waybill}

Apakah paket tersebut sudah diterima atau ada kendala dalam proses pengiriman?

Mohon informasinya. Terima kasih.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
