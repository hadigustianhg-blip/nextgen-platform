import "server-only";
import PDFDocument from "pdfkit";

type PdfInvoice = {
  invoiceNumber: string | null;
  customerNameSnapshot: string;
  companyNameSnapshot: string | null;
  addressSnapshot: string | null;
  invoiceDate: Date;
  dueDate: Date;
  periodStart: Date;
  periodEnd: Date;
  subtotal: { toString(): string };
  discountTotal: { toString(): string };
  grandTotal: { toString(): string };
  notes: string | null;
  tenant: { name: string };
  outlet: { code: string; name: string };
  items: Array<{
    transactionDate: Date;
    waybillNumber: string;
    pickupStaff: string | null;
    sellerNameSnapshot: string;
    weight: { toString(): string };
    freightAmount: { toString(): string };
    discountAmount: { toString(): string };
    finalAmount: { toString(): string };
  }>;
};

type BankAccount = {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
};

const rupiah = (value: { toString(): string }) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(Number(value.toString()));
const dateText = (value: Date) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  }).format(value);

export function invoicePdfFilename(invoice: PdfInvoice) {
  const clean = (value: string) => value
    .normalize("NFKD").replace(/[^\w-]+/g, "-").replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `Invoice_${clean(invoice.invoiceNumber || "DRAFT")}_${clean(invoice.customerNameSnapshot)}.pdf`;
}

export async function createInvoicePdf(
  invoice: PdfInvoice,
  bankAccounts: BankAccount[],
) {
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({
      size: "A4", margin: 38, bufferPages: true,
      info: { Title: invoice.invoiceNumber || "Draft Invoice" },
    });
    const chunks: Buffer[] = [];
    document.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);

    const tableHeader = () => {
      document.font("Helvetica-Bold").fontSize(7);
      const y = document.y;
      ["No", "Tanggal", "No Resi", "Staff", "Pengirim", "Berat", "Ongkir", "Diskon", "Final"]
        .forEach((text, index) => {
          const positions = [38, 58, 102, 170, 220, 325, 365, 430, 495];
          document.text(text, positions[index], y, {
            width: index >= 6 ? 55 : index === 4 ? 100 : 60,
            align: index >= 6 ? "right" : "left",
          });
        });
      document.moveTo(38, y + 13).lineTo(557, y + 13).strokeColor("#CBD5E1").stroke();
      document.y = y + 19;
    };
    const ensureRoom = (height = 28) => {
      if (document.y + height > 790) {
        document.addPage();
        tableHeader();
      }
    };

    document.font("Helvetica-Bold").fontSize(18).text(invoice.tenant.name);
    document.font("Helvetica").fontSize(10).fillColor("#475569")
      .text(`${invoice.outlet.name} (${invoice.outlet.code})`);
    document.moveDown();
    document.fillColor("#0F172A").font("Helvetica-Bold").fontSize(22).text("INVOICE", { align: "right" });
    document.font("Helvetica").fontSize(9)
      .text(`Nomor: ${invoice.invoiceNumber}`, { align: "right" })
      .text(`Tanggal: ${dateText(invoice.invoiceDate)}`, { align: "right" })
      .text(`Jatuh Tempo: ${dateText(invoice.dueDate)}`, { align: "right" });
    document.moveDown();
    document.font("Helvetica-Bold").fontSize(10).text("Ditagihkan kepada:");
    document.font("Helvetica").text(invoice.customerNameSnapshot);
    if (invoice.companyNameSnapshot) document.text(invoice.companyNameSnapshot);
    if (invoice.addressSnapshot) document.text(invoice.addressSnapshot);
    document.moveDown(0.5);
    document.text(
      `Periode: ${dateText(invoice.periodStart)} – ${dateText(invoice.periodEnd)}`,
    );
    document.moveDown();
    tableHeader();

    invoice.items.forEach((item, index) => {
      ensureRoom();
      const y = document.y;
      document.font("Helvetica").fontSize(7).fillColor("#0F172A");
      const cells = [
        String(index + 1), dateText(item.transactionDate), item.waybillNumber,
        item.pickupStaff || "—", item.sellerNameSnapshot,
        item.weight.toString(), rupiah(item.freightAmount),
        rupiah(item.discountAmount), rupiah(item.finalAmount),
      ];
      const positions = [38, 58, 102, 170, 220, 325, 365, 430, 495];
      cells.forEach((text, cellIndex) => document.text(text, positions[cellIndex], y, {
        width: cellIndex >= 6 ? 55 : cellIndex === 4 ? 100 : 60,
        align: cellIndex >= 6 ? "right" : "left",
      }));
      document.y = y + 25;
    });

    ensureRoom(125);
    document.moveDown().font("Helvetica-Bold").fontSize(9)
      .text(`Jumlah Resi: ${invoice.items.length}`, { align: "right" })
      .text(`Subtotal: ${rupiah(invoice.subtotal)}`, { align: "right" })
      .text(`Total Diskon: ${rupiah(invoice.discountTotal)}`, { align: "right" })
      .fontSize(12).text(`Total Tagihan: ${rupiah(invoice.grandTotal)}`, { align: "right" });
    document.moveDown();
    document.font("Helvetica-Bold").fontSize(9).text("Rekening Pembayaran");
    document.font("Helvetica").fontSize(8);
    if (bankAccounts.length) {
      bankAccounts.forEach((account) => document.text(
        `${account.bankName} · ${account.accountNumber} · ${account.accountHolder}`,
      ));
    } else {
      document.text("Rekening pembayaran belum dikonfigurasi.");
    }
    if (invoice.notes) {
      document.moveDown(0.5).font("Helvetica-Bold").text("Catatan");
      document.font("Helvetica").text(invoice.notes);
    }
    document.moveDown().text("Terima kasih atas kepercayaan Anda.", { align: "center" });
    document.end();
  });
}
