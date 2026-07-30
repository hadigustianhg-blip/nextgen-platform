import "server-only";
import PDFDocument from "pdfkit";

type PdfInvoice = {
  status: string;
  invoiceNumber: string | null;
  customerNameSnapshot: string;
  companyNameSnapshot: string | null;
  whatsappSnapshot?: string | null;
  emailSnapshot?: string | null;
  addressSnapshot: string | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  recipientCity?: string | null;
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

export type InvoicePdfPhase =
  | "pdf_start"
  | "logo_loaded"
  | "pdf_document_created"
  | "font_loaded"
  | "header_rendered"
  | "items_rendered"
  | "table_rendered"
  | "totals_rendered"
  | "pdf_finalized"
  | "pdf_end";

type PdfOptions = {
  onPhase?: (phase: InvoicePdfPhase) => void;
  timeoutMs?: number;
};

const PAGE = { width: 595.28, height: 841.89, margin: 36, footerTop: 760 };
const CONTENT_WIDTH = PAGE.width - (PAGE.margin * 2);
const PRIMARY = "#14532D";
const DARK = "#172033";
const MUTED = "#64748B";
const BORDER = "#CBD5E1";
const PALE = "#F1F5F9";
const WHITE = "#FFFFFF";

const rupiah = (value: { toString(): string }) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(Number(value.toString()));

const dateText = (value: Date) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  }).format(value);

const cleanText = (value: string | null | undefined, fallback = "—") =>
  value?.normalize("NFKC").trim() || fallback;
const tenantIdentity = (value: string | null | undefined) => {
  const normalized = value?.normalize("NFKC").trim() || "";
  const platformNames = [
    ["next", "gen"].join(""),
    [["next", "gen"].join(""), "demo"].join(" "),
    ["operations", "system"].join(" "),
  ];
  return platformNames.some((name) =>
    name.localeCompare(normalized, "en", { sensitivity: "base" }) === 0)
    ? ""
    : normalized;
};
const outletIdentity = (invoice: PdfInvoice) =>
  cleanText(invoice.outlet.name, cleanText(invoice.outlet.code, "Outlet"));

export function invoicePdfFilename(invoice: PdfInvoice) {
  const clean = (value: string) => value
    .normalize("NFKD").replace(/[^\w-]+/g, "-").replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `Invoice_${clean(invoice.invoiceNumber || "DRAFT")}_${clean(invoice.customerNameSnapshot)}.pdf`;
}

function drawTextSafe(
  doc: PDFKit.PDFDocument,
  value: string | null | undefined,
  x: number,
  y: number,
  options: PDFKit.Mixins.TextOptions & { fallback?: string } = {},
) {
  const { fallback = "—", ...textOptions } = options;
  doc.text(cleanText(value, fallback), x, y, textOptions);
}

function drawKeyValue(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
) {
  doc.font("Helvetica").fontSize(7).fillColor(MUTED)
    .text(label.toUpperCase(), x, y, { width });
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(DARK)
    .text(cleanText(value), x, y + 11, { width, lineBreak: false, ellipsis: true });
}

function drawSummaryBox(
  doc: PDFKit.PDFDocument,
  input: {
    label: string;
    value: string;
    x: number;
    y: number;
    width: number;
    fill: string;
    valueSize?: number;
  },
) {
  doc.roundedRect(input.x, input.y, input.width, 55, 4).fill(input.fill);
  doc.font("Helvetica-Bold").fontSize(6.5).fillColor(WHITE)
    .text(input.label, input.x + 9, input.y + 9, {
      width: input.width - 18, characterSpacing: 0.3,
    });
  const valueSize = input.valueSize ??
    (input.value.length > 22 ? 8 : input.value.length > 16 ? 9 : 10.5);
  doc.font("Helvetica-Bold").fontSize(valueSize).fillColor(WHITE)
    .text(input.value, input.x + 9, input.y + 25, {
      width: input.width - 18,
      height: 23,
      ellipsis: true,
      lineGap: 0,
    });
}

const tableColumns = [
  { label: "No", width: 22, align: "center" as const },
  { label: "Tanggal", width: 48, align: "center" as const },
  { label: "No Resi", width: 77, align: "center" as const },
  { label: "Staff Pickup", width: 61, align: "left" as const },
  { label: "Pengirim", width: 85, align: "left" as const },
  { label: "Berat", width: 36, align: "right" as const },
  { label: "Ongkir", width: 62, align: "right" as const },
  { label: "Diskon", width: 58, align: "right" as const },
  { label: "Final Ongkir", width: 74, align: "right" as const },
];

function drawTableHeader(doc: PDFKit.PDFDocument, y: number) {
  doc.rect(PAGE.margin, y, CONTENT_WIDTH, 25).fill(PRIMARY);
  let x = PAGE.margin;
  for (const column of tableColumns) {
    doc.font("Helvetica-Bold").fontSize(6.5).fillColor(WHITE)
      .text(column.label, x + 3, y + 8, {
        width: column.width - 6,
        align: column.align,
        lineBreak: false,
        ellipsis: true,
      });
    x += column.width;
  }
  doc.y = y + 25;
}

function tableRowHeight(
  doc: PDFKit.PDFDocument,
  values: string[],
) {
  doc.font("Helvetica").fontSize(7);
  const contentHeights = values.map((value, index) =>
    doc.heightOfString(value, {
      width: tableColumns[index].width - 6,
      height: 20,
      lineGap: 0,
    }));
  return Math.max(25, Math.min(34, Math.max(...contentHeights) + 10));
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  values: string[],
  y: number,
  rowIndex: number,
) {
  const height = tableRowHeight(doc, values);
  doc.rect(PAGE.margin, y, CONTENT_WIDTH, height)
    .fill(rowIndex % 2 ? PALE : WHITE)
    .strokeColor(BORDER).lineWidth(0.35).stroke();
  let x = PAGE.margin;
  for (const [index, column] of tableColumns.entries()) {
    if (index) {
      doc.moveTo(x, y).lineTo(x, y + height)
        .strokeColor(BORDER).lineWidth(0.25).stroke();
    }
    const fontSize = index === 2 && values[index].length > 14 ? 6.2 : 7;
    doc.font("Helvetica").fontSize(fontSize).fillColor(DARK)
      .text(values[index], x + 3, y + 7, {
        width: column.width - 6,
        height: height - 10,
        align: column.align,
        ellipsis: true,
        lineGap: 0,
      });
    x += column.width;
  }
  doc.y = y + height;
  return height;
}

function drawWatermark(doc: PDFKit.PDFDocument, status: string) {
  const label = status === "DRAFT" ? "DRAFT" : status === "VOID" ? "VOID" : null;
  if (!label) return;
  doc.save().fillColor("#94A3B8").fillOpacity(0.09)
    .font("Helvetica-Bold").fontSize(78)
    .rotate(-32, { origin: [PAGE.width / 2, PAGE.height / 2] })
    .text(label, 90, 375, { width: 415, align: "center" })
    .restore();
}

function addContentPage(
  doc: PDFKit.PDFDocument,
  invoice: PdfInvoice,
  withTableHeader = false,
) {
  doc.addPage();
  drawWatermark(doc, invoice.status);
  if (withTableHeader) drawTableHeader(doc, PAGE.margin);
  else doc.y = PAGE.margin;
}

function ensurePageSpace(
  doc: PDFKit.PDFDocument,
  invoice: PdfInvoice,
  requiredHeight: number,
  repeatTableHeader = false,
) {
  if (doc.y + requiredHeight <= PAGE.footerTop - 8) return false;
  addContentPage(doc, invoice, repeatTableHeader);
  return true;
}

function drawPaymentAccounts(
  doc: PDFKit.PDFDocument,
  invoice: PdfInvoice,
  bankAccounts: BankAccount[],
) {
  const accountHeight = bankAccounts.length ? bankAccounts.length * 22 : 20;
  const paymentPhone = invoice.recipientPhone || invoice.whatsappSnapshot;
  const notesHeight = paymentPhone ? 38 : 26;
  ensurePageSpace(doc, invoice, 42 + accountHeight + notesHeight);
  const startY = doc.y;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(PRIMARY)
    .text("PEMBAYARAN DAPAT DILAKUKAN KE:", PAGE.margin, startY, {
      width: CONTENT_WIDTH,
    });
  doc.moveTo(PAGE.margin, startY + 15).lineTo(PAGE.margin + 190, startY + 15)
    .strokeColor(PRIMARY).lineWidth(1).stroke();
  doc.y = startY + 23;
  if (bankAccounts.length) {
    for (const account of bankAccounts) {
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(DARK)
        .text(cleanText(account.bankName), PAGE.margin, doc.y, {
          width: 105, continued: true,
        })
        .font("Helvetica").fillColor(MUTED)
        .text(`  ${cleanText(account.accountNumber)}  |  a.n. ${cleanText(account.accountHolder)}`, {
          width: CONTENT_WIDTH - 105,
        });
      doc.moveDown(0.45);
    }
  } else {
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
      .text("Informasi rekening pembayaran belum tersedia.", PAGE.margin, doc.y, {
        width: CONTENT_WIDTH, lineBreak: false,
      });
    doc.moveDown(0.8);
  }
  doc.font("Helvetica").fontSize(8).fillColor(DARK)
    .text(
      "Mohon mencantumkan nomor invoice pada saat melakukan pembayaran.",
      PAGE.margin,
      doc.y + 5,
      { width: CONTENT_WIDTH },
    );
  if (paymentPhone) {
    doc.text(
      `Setelah pembayaran dilakukan, mohon mengirimkan bukti transfer ke nomor WhatsApp ${paymentPhone}.`,
      PAGE.margin,
      doc.y + 3,
      { width: CONTENT_WIDTH },
    );
  }
}

function drawFooter(
  doc: PDFKit.PDFDocument,
  invoice: PdfInvoice,
  pageNumber: number,
  pageCount: number,
) {
  const y = PAGE.footerTop;
  doc.moveTo(PAGE.margin, y).lineTo(PAGE.width - PAGE.margin, y)
    .strokeColor(BORDER).lineWidth(0.5).stroke();
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(DARK)
    .text("Terima kasih atas kepercayaan Anda.", PAGE.margin, y + 8, {
      width: 240,
    });
  doc.font("Helvetica").fontSize(7).fillColor(MUTED)
    .text(
      [
        `${outletIdentity(invoice)} (${cleanText(invoice.outlet.code, "Outlet")})`,
        tenantIdentity(invoice.tenant.name),
      ].filter(Boolean).join(" · "),
      PAGE.margin,
      y + 19,
      { width: 350, lineBreak: false, ellipsis: true },
    )
    .text(
      "Invoice ini dibuat secara elektronik dan tidak memerlukan tanda tangan.",
      PAGE.margin,
      y + 29,
      { width: 390, lineBreak: false, ellipsis: true },
    )
    .text(`Halaman ${pageNumber} dari ${pageCount}`, PAGE.width - 145, y + 19, {
      width: 109, align: "right", lineBreak: false,
    });
}

function drawInvoiceHeader(doc: PDFKit.PDFDocument, invoice: PdfInvoice) {
  const top = PAGE.margin;
  doc.font("Helvetica-Bold").fontSize(27).fillColor(DARK)
    .text("INVOICE", PAGE.margin, top, { width: 225 });
  doc.font("Helvetica").fontSize(8).fillColor(MUTED)
    .text("Dokumen tagihan elektronik", PAGE.margin, top + 34, { width: 225 });

  doc.font("Helvetica-Bold").fontSize(13).fillColor(DARK)
    .text(outletIdentity(invoice), 318, top, {
      width: 241, align: "right",
    });
  doc.font("Helvetica-Bold").fontSize(9).fillColor(PRIMARY)
    .text(cleanText(invoice.outlet.code), 318, doc.y + 2, {
      width: 241, align: "right",
    });
  const tenantName = tenantIdentity(invoice.tenant.name);
  if (tenantName) {
    doc.font("Helvetica").fontSize(8).fillColor(MUTED)
      .text(tenantName, 318, doc.y + 2, {
        width: 241, align: "right",
      });
  }
  doc.moveTo(PAGE.margin, top + 68).lineTo(PAGE.width - PAGE.margin, top + 68)
    .strokeColor(PRIMARY).lineWidth(2).stroke();

  const customerY = top + 85;
  doc.font("Helvetica-Bold").fontSize(8).fillColor(PRIMARY)
    .text("DITAGIHKAN KEPADA", PAGE.margin, customerY, { width: 245 });
  doc.font("Helvetica-Bold").fontSize(11).fillColor(DARK)
    .text(
      cleanText(invoice.recipientName || invoice.customerNameSnapshot),
      PAGE.margin,
      customerY + 16,
      {
      width: 245,
      },
    );
  const customerLines = [
    invoice.companyNameSnapshot,
    invoice.addressSnapshot,
    invoice.recipientCity,
    invoice.recipientPhone ? `WA: ${invoice.recipientPhone}` : null,
    invoice.emailSnapshot ? `Email: ${invoice.emailSnapshot}` : null,
  ].filter((value): value is string => Boolean(value?.trim()));
  doc.font("Helvetica").fontSize(8).fillColor(MUTED)
    .text(customerLines.join("\n") || "Informasi customer belum lengkap.", PAGE.margin, doc.y + 3, {
      width: 245, height: 54, ellipsis: true,
    });

  const detailX = 318;
  drawKeyValue(doc, "Nomor Invoice", invoice.invoiceNumber || "DRAFT", detailX, customerY, 115);
  drawKeyValue(doc, "Status", invoice.status, 450, customerY, 109);
  drawKeyValue(doc, "Tanggal Invoice", dateText(invoice.invoiceDate), detailX, customerY + 34, 115);
  drawKeyValue(doc, "Jatuh Tempo", dateText(invoice.dueDate), 450, customerY + 34, 109);
  drawKeyValue(
    doc,
    "Periode Tagihan",
    `${dateText(invoice.periodStart)} - ${dateText(invoice.periodEnd)}`,
    detailX,
    customerY + 68,
    241,
  );

  const summaryY = customerY + 111;
  const gap = 5;
  const boxWidth = (CONTENT_WIDTH - (gap * 3)) / 4;
  [
    { label: "NOMOR INVOICE", value: invoice.invoiceNumber || "DRAFT", fill: PRIMARY },
    { label: "TANGGAL INVOICE", value: dateText(invoice.invoiceDate), fill: PRIMARY },
    { label: "JATUH TEMPO", value: dateText(invoice.dueDate), fill: PRIMARY },
    { label: "TOTAL TAGIHAN", value: rupiah(invoice.grandTotal), fill: DARK, valueSize: 11 },
  ].forEach((box, index) => drawSummaryBox(doc, {
    ...box,
    x: PAGE.margin + (index * (boxWidth + gap)),
    y: summaryY,
    width: boxWidth,
  }));
  doc.y = summaryY + 72;
}

function drawTotals(doc: PDFKit.PDFDocument, invoice: PdfInvoice) {
  ensurePageSpace(doc, invoice, 116);
  const width = 255;
  const x = PAGE.width - PAGE.margin - width;
  const y = doc.y + 5;
  doc.roundedRect(x, y, width, 101, 4).fill(PALE);
  const rows = [
    ["Jumlah Resi", `${invoice.items.length} resi`],
    ["Subtotal", rupiah(invoice.subtotal)],
    ["Total Diskon", rupiah(invoice.discountTotal)],
  ];
  rows.forEach(([label, value], index) => {
    const rowY = y + 11 + (index * 20);
    doc.font("Helvetica").fontSize(8).fillColor(MUTED)
      .text(label, x + 12, rowY, { width: 92, lineBreak: false });
    doc.font("Helvetica-Bold").fillColor(DARK)
      .text(value, x + 105, rowY, { width: 138, align: "right", lineBreak: false });
  });
  doc.rect(x, y + 70, width, 31).fill(DARK);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(WHITE)
    .text("TOTAL TAGIHAN", x + 12, y + 81, {
      width: 90, lineBreak: false,
    })
    .fontSize(11)
    .text(rupiah(invoice.grandTotal), x + 103, y + 79, {
      width: 140, align: "right", lineBreak: false,
    });
  doc.y = y + 116;
}

export async function createInvoicePdf(
  invoice: PdfInvoice,
  bankAccounts: BankAccount[],
  options: PdfOptions = {},
) {
  return new Promise<Buffer>((resolve, reject) => {
    options.onPhase?.("pdf_start");
    options.onPhase?.("logo_loaded");
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      finish(() => reject(new Error("INVOICE_PDF_TIMEOUT")));
    }, options.timeoutMs ?? 15_000);

    let doc: PDFKit.PDFDocument;
    try {
      doc = new PDFDocument({
        size: "A4",
        margin: PAGE.margin,
        bufferPages: true,
        autoFirstPage: false,
        info: { Title: invoice.invoiceNumber || "Draft Invoice" },
      });
      options.onPhase?.("pdf_document_created");
      doc.font("Helvetica");
      options.onPhase?.("font_loaded");
    } catch (error) {
      finish(() => reject(error));
      return;
    }

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.once("end", () => {
      options.onPhase?.("pdf_finalized");
      options.onPhase?.("pdf_end");
      finish(() => resolve(Buffer.concat(chunks)));
    });
    doc.once("error", (error) => finish(() => reject(error)));

    try {
      addContentPage(doc, invoice);
      drawInvoiceHeader(doc, invoice);
      options.onPhase?.("header_rendered");

      drawTableHeader(doc, doc.y);
      invoice.items.forEach((item, index) => {
        const values = [
          String(index + 1),
          dateText(item.transactionDate),
          cleanText(item.waybillNumber),
          cleanText(item.pickupStaff),
          cleanText(item.sellerNameSnapshot),
          item.weight.toString(),
          rupiah(item.freightAmount),
          rupiah(item.discountAmount),
          rupiah(item.finalAmount),
        ];
        const height = tableRowHeight(doc, values);
        ensurePageSpace(doc, invoice, height, true);
        drawTableRow(doc, values, doc.y, index);
      });
      options.onPhase?.("items_rendered");
      options.onPhase?.("table_rendered");

      drawTotals(doc, invoice);
      options.onPhase?.("totals_rendered");
      drawPaymentAccounts(doc, invoice, bankAccounts);
      if (invoice.notes) {
        ensurePageSpace(doc, invoice, 45);
        doc.moveDown(0.8).font("Helvetica-Bold").fontSize(8).fillColor(DARK)
          .text("CATATAN", PAGE.margin, doc.y, { width: CONTENT_WIDTH });
        drawTextSafe(doc, invoice.notes, PAGE.margin, doc.y + 4, {
          width: CONTENT_WIDTH,
          fallback: "",
        });
      }

      const range = doc.bufferedPageRange();
      for (let pageIndex = 0; pageIndex < range.count; pageIndex += 1) {
        doc.switchToPage(range.start + pageIndex);
        drawFooter(doc, invoice, pageIndex + 1, range.count);
      }
      doc.end();
    } catch (error) {
      finish(() => reject(error));
    }
  });
}
