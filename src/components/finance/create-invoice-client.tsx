"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check, ChevronRight, Download, Eye, FileCheck2, LoaderCircle,
  MessageCircle, ReceiptText, Save, Send, X,
} from "lucide-react";
import {
  AppCard, FilterCard, MetricCard, ModalCard, PageHeader, SectionCard, TableCard,
  nextgenButtonClass, nextgenControlClass, nextgenNeutralButtonClass,
} from "@/components/ui";
import { jakartaOperationalDate } from "@/lib/dates/jakarta-date";
import { DownloadFileError, downloadFile } from "@/lib/files/download-file";
import {
  buildInvoiceSourceItemsQuery, canSaveInvoiceDraft, formatRupiahFromCents,
  invoiceDraftErrorMessage, invoicePdfErrorMessage, invoiceWhatsappDisabledReason,
  invoiceWhatsappErrorMessage, selectableInvoiceItems, sumMoney,
  buildRecipientWhatsappMessage, buildRecipientWhatsappUrl,
  billingAddressAfterRecipient, getFirstSelectedWaybill,
  invoiceRecipientDetailErrorMessage, invoiceVoidReasonError,
} from "./invoice.view";

type Seller = {
  customerKey: string;
  customerName: string;
  itemCount: number;
  totalOutstanding: string;
  oldestDate: string;
  newestDate: string;
  draftCount: number;
};
type SourceItem = {
  id: string;
  customerKey: string;
  sellerName: string;
  companyName: string | null;
  address: string | null;
  whatsapp: string | null;
  email: string | null;
  transactionDate: string;
  waybillNumber: string;
  pickupStaff: string | null;
  weight: string;
  freightAmount: string;
  discountAmount: string;
  finalAmount: string;
  obligationAmount: string;
  draftInvoiceId: string | null;
  draftInvoiceNumber: string | null;
  selectable: boolean;
};
type InvoiceItem = {
  id: string;
  masterPickupId: string;
  waybillNumber: string;
  transactionDate: string;
  pickupStaff: string | null;
  sellerNameSnapshot: string;
  weight: string;
  freightAmount: string;
  discountAmount: string;
  finalAmount: string;
  obligationAmount: string;
};
type Invoice = {
  id: string;
  invoiceNumber: string | null;
  customerKey: string;
  customerNameSnapshot: string;
  companyNameSnapshot: string | null;
  whatsappSnapshot: string | null;
  emailSnapshot: string | null;
  addressSnapshot: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  recipientCity: string | null;
  transferBankName: string | null;
  transferAccountNumber: string | null;
  transferAccountHolder: string | null;
  invoiceDate: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  subtotal: string;
  discountTotal: string;
  grandTotal: string;
  status: string;
  notes: string | null;
  items: InvoiceItem[];
  outlet?: { code: string; name: string };
  tenant?: { name: string };
  _count?: { items: number };
};
type BankAccount = {
  id: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  isDefault: boolean;
};

const today = jakartaOperationalDate();
const isoDate = (value: string) => value.slice(0, 10);
const plusDays = (value: string, days: number) => {
  const result = new Date(`${value}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
};
const displayDate = (value: string) => new Intl.DateTimeFormat("id-ID", {
  day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
}).format(new Date(`${isoDate(value)}T00:00:00.000Z`));
const money = (value: string) => formatRupiahFromCents(sumMoney([value]));
const validRange = (start: string, end: string) => {
  const first = Date.parse(`${start}T00:00:00.000Z`);
  const last = Date.parse(`${end}T00:00:00.000Z`);
  return Boolean(start && end && Number.isFinite(first) && Number.isFinite(last) &&
    first <= last && (last - first) / 86_400_000 <= 30);
};

export function CreateInvoiceClient({
  bankAccounts,
  canCreate,
  canIssue,
  canExport,
  canWhatsapp,
  canVoid,
}: {
  bankAccounts: BankAccount[];
  canCreate: boolean;
  canIssue: boolean;
  canExport: boolean;
  canWhatsapp: boolean;
  canVoid: boolean;
}) {
  const [startDate, setStartDate] = useState(`${today.slice(0, 7)}-01`);
  const [endDate, setEndDate] = useState(today);
  const [sellerSearch, setSellerSearch] = useState("");
  const [waybillSearch, setWaybillSearch] = useState("");
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);
  const [items, setItems] = useState<SourceItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [pdfLoadingId, setPdfLoadingId] = useState("");
  const [recipientLoadingId, setRecipientLoadingId] = useState("");
  const [recipientLoadedId, setRecipientLoadedId] = useState("");
  const [recipientDetailWaybill, setRecipientDetailWaybill] = useState("");
  const [recipientHelper, setRecipientHelper] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [itemsError, setItemsError] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [currentInvoice, setCurrentInvoice] = useState<Invoice | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [recipientCity, setRecipientCity] = useState("");
  const [availableBankAccounts, setAvailableBankAccounts] = useState(bankAccounts);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState(
    bankAccounts.length ? bankAccounts[0].id : "",
  );
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [editingBankAccountId, setEditingBankAccountId] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [makeDefaultAccount, setMakeDefaultAccount] = useState(
    bankAccounts.length === 0,
  );
  const [bankSaving, setBankSaving] = useState(false);
  const [bankError, setBankError] = useState("");
  const [highlightWaybills, setHighlightWaybills] = useState(false);
  const waybillTableRef = useRef<HTMLDivElement>(null);
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState(plusDays(today, 7));
  const [notes, setNotes] = useState("");
  const [adminWhatsapp, setAdminWhatsapp] = useState("");
  const [adminWhatsappSaving, setAdminWhatsappSaving] = useState(false);
  const [voidInvoiceTarget, setVoidInvoiceTarget] = useState<Invoice | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidError, setVoidError] = useState("");
  const [voidSaving, setVoidSaving] = useState(false);

  useEffect(() => {
    void fetch("/api/finance/invoice-outlet-settings", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((result) => {
        if (result?.data) {
          setAdminWhatsapp(
            result.data.adminWhatsapp ||
            result.data.tenantAdminWhatsapp ||
            "",
          );
        }
      });
  }, []);

  useEffect(() => {
    if (!voidInvoiceTarget) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !voidSaving) {
        setVoidInvoiceTarget(null);
        setVoidReason("");
        setVoidError("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [voidInvoiceTarget, voidSaving]);

  async function loadInvoices(search = invoiceSearch, status = invoiceStatus) {
    const query = new URLSearchParams({
      search, status, page: "1", pageSize: "25",
    });
    const response = await fetch(`/api/finance/invoices?${query}`, { cache: "no-store" });
    if (response.ok) setInvoices((await response.json()).data);
  }

  async function loadSellers() {
    if (!validRange(startDate, endDate)) {
      setError("Rentang tanggal tidak valid.");
      return;
    }
    setLoading(true);
    setError("");
    setSelectedSeller(null);
    setItems([]);
    setSelectedIds(new Set());
    setDraftId(null);
    try {
      const query = new URLSearchParams({
        startDate, endDate, seller: sellerSearch, waybill: waybillSearch,
      });
      const response = await fetch(`/api/finance/invoice-source-sellers?${query}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      const payload = await response.json();
      setSellers(payload.data);
      await loadInvoices();
      if (!payload.data.length) setNotice("Tidak ada resi belum bayar pada periode ini.");
      else setNotice("");
    } catch {
      setError("Data Pickup Belum Bayar tidak dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }

  async function selectSeller(
    seller: Seller,
    range = { startDate, endDate },
    existingInvoiceId?: string,
  ) {
    setSelectedSeller(seller);
    setSelectedIds(new Set());
    setDraftId(null);
    setCustomerName(seller.customerName);
    setWhatsapp("");
    setAddress("");
    setRecipientCity("");
    setRecipientDetailWaybill("");
    setRecipientLoadedId("");
    setRecipientHelper("");
    setDetailLoading(true);
    setError("");
    setItemsError("");
    setItems([]);
    try {
      const query = buildInvoiceSourceItemsQuery({
        ...range, customerKey: seller.customerKey, invoiceId: existingInvoiceId,
      });
      const response = await fetch(`/api/finance/invoice-source-items?${query}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message || payload.error?.message ||
          "Data resi seller tidak dapat dimuat.");
      }
      setItems(payload.data);
      setCustomerName(seller.customerName);
      setCompanyName(payload.data[0]?.companyName || "");
      setWhatsapp(payload.data[0]?.whatsapp || "");
      setEmail(payload.data[0]?.email || "");
      setAddress(payload.data[0]?.address || "");
      setRecipientCity("");
      setRecipientDetailWaybill("");
      setRecipientLoadedId("");
      setRecipientHelper("");
    } catch (cause) {
      setItems([]);
      setItemsError(cause instanceof Error
        ? cause.message
        : "Data resi seller tidak dapat dimuat.");
    } finally {
      setDetailLoading(false);
    }
  }

  function toggleItem(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    updateSelectedIds(next);
  }

  const selectable = selectableInvoiceItems(items);
  const allSelected = selectable.length > 0 &&
    selectable.every((item) => selectedIds.has(item.id));
  const selectedItems = items.filter((item) => selectedIds.has(item.id));
  const selectedSubtotal = sumMoney(selectedItems.map((item) => item.freightAmount));
  const selectedDiscount = sumMoney(selectedItems.map((item) => item.discountAmount));
  const selectedTotal = sumMoney(selectedItems.map((item) => item.obligationAmount));
  const firstSelectedWaybill = getFirstSelectedWaybill(items, selectedIds);
  const selectedBankAccount = availableBankAccounts.find(
    (account) => account.id === selectedBankAccountId,
  ) ?? null;
  const draftCanBeSaved = canSaveInvoiceDraft({
    sellerSelected: Boolean(selectedSeller),
    detailLoading,
    saving,
    selectedCount: selectedIds.size,
    totalCents: selectedTotal,
  });

  function toggleAll() {
    updateSelectedIds(allSelected
      ? new Set()
      : new Set(selectable.map((item) => item.id)));
  }

  function updateSelectedIds(next: Set<string>) {
    const nextWaybill = getFirstSelectedWaybill(items, next);
    if (nextWaybill !== firstSelectedWaybill && recipientDetailWaybill) {
      setRecipientDetailWaybill("");
      setRecipientLoadedId("");
      setRecipientCity("");
      setCustomerName(selectedSeller?.customerName ?? "");
      setWhatsapp(items[0]?.whatsapp || "");
      setAddress(items[0]?.address || "");
      setRecipientHelper(nextWaybill
        ? `Pilihan resi berubah. Ambil ulang detail dari resi ${nextWaybill}.`
        : "Centang minimal satu resi pada daftar di bawah.");
    }
    setSelectedIds(next);
  }

  function draftPayload() {
    if (!selectedSeller || !selectedIds.size) return null;
    return {
      customerKey: selectedSeller.customerKey,
      customerName,
      companyName: companyName || null,
      whatsapp: whatsapp || null,
      email: email || null,
      address: address || null,
      recipientName: customerName || null,
      recipientPhone: whatsapp || null,
      recipientCity: recipientCity || null,
      bankAccountId: selectedBankAccountId || null,
      invoiceDate,
      dueDate,
      periodStart: startDate,
      periodEnd: endDate,
      notes: notes || null,
      itemIds: [...selectedIds],
    };
  }

  async function saveDraft() {
    if (saving) return;
    const payload = draftPayload();
    if (!payload || selectedTotal <= 0n) {
      setError("Pilih minimal satu resi untuk membuat invoice.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        draftId ? `/api/finance/invoices/${draftId}` : "/api/finance/invoices",
        {
          method: draftId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        const code = result.code || result.error?.code;
        throw new Error(invoiceDraftErrorMessage(
          code, result.message || result.error?.message,
        ));
      }
      setDraftId(result.data.id);
      setCurrentInvoice(result.data);
      setNotice("Draft invoice berhasil disimpan.");
      await loadInvoices();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invoice gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function issueCurrentInvoice() {
    if (!draftId || issuing) return;
    setIssuing(true);
    setError("");
    try {
      const response = await fetch(`/api/finance/invoices/${draftId}/issue`, {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Invoice gagal difinalisasi.");
      setCurrentInvoice(result.data);
      setNotice(`Invoice ${result.data.invoiceNumber} berhasil diterbitkan.`);
      await loadInvoices();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invoice gagal difinalisasi.");
    } finally {
      setIssuing(false);
    }
  }

  async function openInvoice(id: string) {
    const response = await fetch(`/api/finance/invoices/${id}`, { cache: "no-store" });
    if (!response.ok) {
      setError("Invoice tidak ditemukan.");
      return;
    }
    const invoice: Invoice = (await response.json()).data;
    setCurrentInvoice(invoice);
    if (invoice.status === "DRAFT") {
      const seller: Seller = {
        customerKey: invoice.customerKey,
        customerName: invoice.customerNameSnapshot,
        itemCount: invoice.items.length,
        totalOutstanding: invoice.grandTotal,
        oldestDate: isoDate(invoice.periodStart),
        newestDate: isoDate(invoice.periodEnd),
        draftCount: 1,
      };
      setStartDate(isoDate(invoice.periodStart));
      setEndDate(isoDate(invoice.periodEnd));
      setSelectedSeller(seller);
      setDraftId(invoice.id);
      setCustomerName(invoice.customerNameSnapshot);
      setCompanyName(invoice.companyNameSnapshot || "");
      setWhatsapp(invoice.whatsappSnapshot || "");
      setEmail(invoice.emailSnapshot || "");
      setAddress(invoice.addressSnapshot || "");
      setRecipientCity(invoice.recipientCity || "");
      setSelectedBankAccountId(availableBankAccounts.find((account) =>
        account.bankName === invoice.transferBankName &&
        account.accountNumber === invoice.transferAccountNumber &&
        account.accountHolder === invoice.transferAccountHolder
      )?.id ?? "");
      setInvoiceDate(isoDate(invoice.invoiceDate));
      setDueDate(isoDate(invoice.dueDate));
      setNotes(invoice.notes || "");
      await selectSeller(seller, {
        startDate: isoDate(invoice.periodStart),
        endDate: isoDate(invoice.periodEnd),
      }, invoice.id);
      setDraftId(invoice.id);
      setSelectedIds(new Set(invoice.items.map((item) => item.masterPickupId)));
      setCustomerName(invoice.customerNameSnapshot);
      setCompanyName(invoice.companyNameSnapshot || "");
      setWhatsapp(invoice.whatsappSnapshot || "");
      setEmail(invoice.emailSnapshot || "");
      setAddress(invoice.addressSnapshot || "");
      setRecipientCity(invoice.recipientCity || "");
      setSelectedBankAccountId(availableBankAccounts.find((account) =>
        account.bankName === invoice.transferBankName &&
        account.accountNumber === invoice.transferAccountNumber &&
        account.accountHolder === invoice.transferAccountHolder
      )?.id ?? "");
      setInvoiceDate(isoDate(invoice.invoiceDate));
      setDueDate(isoDate(invoice.dueDate));
      setNotes(invoice.notes || "");
    }
  }

  async function exportPdf(invoice: Invoice) {
    if (pdfLoadingId) return;
    setPdfLoadingId(invoice.id);
    setError("");
    try {
      await downloadFile(`/api/finance/invoices/${invoice.id}/pdf`, {
        expectedContentType: "application/pdf",
      });
    } catch (cause) {
      setError(cause instanceof DownloadFileError
        ? invoicePdfErrorMessage(cause.code, cause.message)
        : invoicePdfErrorMessage(undefined));
    } finally {
      setPdfLoadingId("");
    }
  }

  async function showRecipientDetail(invoice: Invoice) {
    if (recipientLoadingId || invoice.status !== "DRAFT") return;
    setRecipientLoadingId(invoice.id);
    setRecipientLoadedId("");
    setError("");
    try {
      const response = await fetch(
        `/api/finance/invoices/${invoice.id}/recipient-detail`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(invoiceRecipientDetailErrorMessage(result.error?.code));
      }
      setCurrentInvoice((current) => current?.id === invoice.id
        ? {
            ...current,
            ...result.data,
            addressSnapshot: result.data.recipientCity || null,
          }
        : current);
      setRecipientLoadedId(invoice.id);
      setNotice("Detail penerima ditampilkan.");
      await loadInvoices();
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : "Gagal mengambil detail penerima.");
    } finally {
      setRecipientLoadingId("");
    }
  }

  async function showSelectedRecipientDetail() {
    if (recipientLoadingId) return;
    const waybillNo = firstSelectedWaybill;
    if (!waybillNo) {
      setRecipientHelper("Centang minimal satu resi pada daftar di bawah.");
      focusWaybillTable();
      return;
    }
    setRecipientLoadingId("form");
    setRecipientLoadedId("");
    setError("");
    try {
      const response = await fetch(
        `/api/finance/invoices/recipient-detail?waybillNo=${encodeURIComponent(waybillNo)}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(invoiceRecipientDetailErrorMessage(result.error?.code));
      }
      setCustomerName(result.data.recipientName || customerName);
      setWhatsapp(result.data.recipientPhone || whatsapp);
      setRecipientCity(result.data.recipientCity || "");
      setAddress((current) =>
        billingAddressAfterRecipient(current, result.data.recipientCity));
      setRecipientDetailWaybill(result.data.waybillNo);
      setRecipientLoadedId("form");
      setRecipientHelper(
        `Detail penerima berhasil diambil dari resi ${result.data.waybillNo}.`,
      );
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : "Gagal mengambil detail penerima.");
    } finally {
      setRecipientLoadingId("");
    }
  }

  function focusWaybillTable() {
    waybillTableRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    setHighlightWaybills(true);
    window.setTimeout(() => setHighlightWaybills(false), 1_500);
  }

  function openBankModal(account?: BankAccount) {
    setEditingBankAccountId(account?.id ?? "");
    setBankName(account?.bankName ?? "");
    setAccountNumber(account?.accountNumber ?? "");
    setAccountHolder(account?.accountHolder ?? "");
    setMakeDefaultAccount(account?.isDefault ??
      availableBankAccounts.length === 0);
    setBankError("");
    setBankModalOpen(true);
  }

  async function refreshBankAccounts(preferredId?: string) {
    const response = await fetch("/api/finance/outlet-bank-accounts", {
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error?.message ||
        "Daftar rekening penerima tidak dapat dimuat.");
    }
    setAvailableBankAccounts(result.data);
    const nextId = preferredId && result.data.some(
      (account: BankAccount) => account.id === preferredId,
    )
      ? preferredId
      : result.data[0]?.id ?? "";
    setSelectedBankAccountId(nextId);
  }

  async function saveBankAccount() {
    if (bankSaving) return;
    if (!bankName.trim() || !accountNumber.trim() || !accountHolder.trim()) {
      setBankError("Nama bank, nomor rekening, dan atas nama wajib diisi.");
      return;
    }
    setBankSaving(true);
    setBankError("");
    try {
      const response = await fetch(
        editingBankAccountId
          ? `/api/finance/outlet-bank-accounts/${editingBankAccountId}`
          : "/api/finance/outlet-bank-accounts",
        {
        method: editingBankAccountId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bankName,
          accountNumber,
          accountHolder,
          isDefault: makeDefaultAccount,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.message ||
          "Rekening penerima gagal disimpan.");
      }
      await refreshBankAccounts(result.data.id);
      setBankModalOpen(false);
      setNotice("Rekening penerima berhasil disimpan.");
    } catch (cause) {
      setBankError(cause instanceof Error
        ? cause.message
        : "Rekening penerima gagal disimpan.");
    } finally {
      setBankSaving(false);
    }
  }

  async function saveAdminWhatsapp() {
    if (adminWhatsappSaving) return;
    setAdminWhatsappSaving(true);
    setError("");
    try {
      const response = await fetch("/api/finance/invoice-outlet-settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ adminWhatsapp: adminWhatsapp.trim() || null }),
      });
      if (!response.ok) throw new Error();
      const result = await response.json();
      setAdminWhatsapp(result.data.adminWhatsapp || "");
      setNotice("WhatsApp Admin outlet berhasil disimpan.");
    } catch {
      setError("WhatsApp Admin outlet gagal disimpan.");
    } finally {
      setAdminWhatsappSaving(false);
    }
  }

  function chatRecipient(invoice: Invoice) {
    const message = buildRecipientWhatsappMessage({
      recipientName: invoice.recipientName,
      outletName: invoice.outlet?.name,
      invoiceNumber: invoice.invoiceNumber,
      formattedTotal: money(invoice.grandTotal),
      formattedDueDate: invoice.dueDate ? displayDate(invoice.dueDate) : null,
    });
    const url = buildRecipientWhatsappUrl({
      phone: invoice.recipientPhone,
      message,
    });
    if (!url) {
      setError("Tampilkan detail penerima terlebih dahulu.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function prepareWhatsapp(invoice: Invoice) {
    setError("");
    try {
      const response = await fetch(
        `/api/finance/invoices/${invoice.id}/prepare-whatsapp`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ confirmation: true }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(invoiceWhatsappErrorMessage(
          result.code || result.error?.code,
          result.message || result.error?.message,
        ));
      }
      window.open(result.data.url, "_blank", "noopener,noreferrer");
      setNotice(result.data.attachmentInstruction);
      await loadInvoices();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nomor WhatsApp customer belum valid.");
    }
  }

  function openVoidModal(invoice: Invoice) {
    setVoidInvoiceTarget(invoice);
    setVoidReason("");
    setVoidError("");
  }

  function closeVoidModal() {
    if (voidSaving) return;
    setVoidInvoiceTarget(null);
    setVoidReason("");
    setVoidError("");
  }

  async function submitVoidInvoice() {
    if (!voidInvoiceTarget || voidSaving) return;
    const validationError = invoiceVoidReasonError(voidReason);
    if (validationError) {
      setVoidError(validationError);
      return;
    }
    setVoidSaving(true);
    setVoidError("");
    try {
      const response = await fetch(
        `/api/finance/invoices/${voidInvoiceTarget.id}/void`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: voidReason.trim() }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        setVoidError(result.error?.code === "INVOICE_LOCKED"
          ? "Invoice ini tidak dapat dibatalkan pada status saat ini."
          : "Invoice gagal dibatalkan.");
        return;
      }
      const invoiceNumber =
        voidInvoiceTarget.invoiceNumber || "Draft invoice";
      setCurrentInvoice((current) => current?.id === result.data.id
        ? result.data
        : current);
      setInvoices((current) => current.map((invoice) =>
        invoice.id === result.data.id ? { ...invoice, ...result.data } : invoice));
      setNotice(`Invoice ${invoiceNumber} berhasil dibatalkan.`);
      setVoidInvoiceTarget(null);
      setVoidReason("");
      await Promise.all([loadInvoices(), loadSellers()]);
    } catch {
      setVoidError("Invoice gagal dibatalkan.");
    } finally {
      setVoidSaving(false);
    }
  }

  return <div className="space-y-6">
    <PageHeader eyebrow="Finance & HR" title="Create Invoice"
      description="Buat invoice customer dari Pickup Belum Bayar yang masih valid."/>
    {notice && <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">{notice}</div>}
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
    <FilterCard><div className="grid gap-3 md:grid-cols-5">
      <input aria-label="Tanggal Awal" type="date" value={startDate}
        onChange={(event) => setStartDate(event.target.value)} className={nextgenControlClass}/>
      <input aria-label="Tanggal Akhir" type="date" value={endDate}
        onChange={(event) => setEndDate(event.target.value)} className={nextgenControlClass}/>
      <input aria-label="Search Seller" placeholder="Search Seller" value={sellerSearch}
        onChange={(event) => setSellerSearch(event.target.value)} className={nextgenControlClass}/>
      <input aria-label="Search Waybill" placeholder="Search Waybill" value={waybillSearch}
        onChange={(event) => setWaybillSearch(event.target.value)} className={nextgenControlClass}/>
      <button type="button" disabled={loading} onClick={() => void loadSellers()}
        className={nextgenButtonClass}>{loading && <LoaderCircle className="animate-spin" size={17}/>}Tampilkan</button>
    </div></FilterCard>

    <section className="grid items-start gap-5 lg:grid-cols-[minmax(280px,2fr)_minmax(0,3fr)]">
      <SectionCard title="Seller Pickup Belum Bayar" className="lg:sticky lg:top-24">
        {sellers.length ? <div className="space-y-2">{sellers.map((seller) => {
          const active = selectedSeller?.customerKey === seller.customerKey;
          return <button type="button" key={seller.customerKey}
            onClick={() => void selectSeller(seller)}
            aria-current={active ? "true" : undefined}
            className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${
              active ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500" : "border-slate-200 hover:bg-slate-50"
            }`}>
            <span><span className="block font-semibold text-slate-950">{seller.customerName}</span>
              <span className="text-xs text-slate-500">{seller.itemCount} resi · {money(seller.totalOutstanding)}</span>
              {seller.draftCount > 0 && <span className="mt-1 block text-xs font-semibold text-amber-700">{seller.draftCount} resi ada di draft</span>}
            </span>
            <span className="flex items-center gap-1">{active && <Check size={16} className="text-blue-700"/>}<ChevronRight size={18}/></span>
          </button>;
        })}</div> : <p className="py-12 text-center text-sm text-slate-500">
          {loading ? "Memuat seller..." : "Tidak ada seller untuk ditampilkan."}
        </p>}
      </SectionCard>

      <SectionCard title={selectedSeller ? `Invoice — ${selectedSeller.customerName}` : "Detail Seller"}>
        {!selectedSeller ? <div className="grid min-h-72 place-items-center text-center text-sm text-slate-500">
          Pilih seller untuk melihat resi Pickup Belum Bayar.
        </div> : <div className="space-y-5">
          <AppCard className="space-y-4 rounded-2xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Informasi Customer
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <input aria-label="Nama Customer/Penerima" value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                className={nextgenControlClass}/>
              <input aria-label="Nama Perusahaan" placeholder="Nama perusahaan (opsional)"
                value={companyName} onChange={(event) => setCompanyName(event.target.value)}
                className={nextgenControlClass}/>
              <input aria-label="Nomor WhatsApp" placeholder="Nomor WhatsApp"
                value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)}
                className={nextgenControlClass}/>
              <input aria-label="Email" placeholder="Email (opsional)" value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={nextgenControlClass}/>
              <textarea aria-label="Alamat" placeholder="Alamat penagihan" value={address}
                onChange={(event) => setAddress(event.target.value)}
                className={`${nextgenControlClass} md:col-span-2`}/>
              <input aria-label="Kota/Kabupaten" placeholder="Kota/Kabupaten"
                value={recipientCity}
                onChange={(event) => setRecipientCity(event.target.value)}
                className={nextgenControlClass}/>
            </div>
            <div>
              <button type="button"
                disabled={!selectedSeller || !firstSelectedWaybill ||
                  recipientLoadingId === "form"}
                onClick={() => void showSelectedRecipientDetail()}
                className={nextgenNeutralButtonClass}>
                {recipientLoadingId === "form" &&
                  <LoaderCircle className="animate-spin" size={17}/>}
                {recipientLoadingId === "form"
                  ? "Mengambil detail..."
                  : "Tampilkan Detail Penerima"}
              </button>
              <p className="mt-2 text-sm text-slate-500">
                {recipientLoadingId === "form"
                  ? "Mengambil detail..."
                  : recipientHelper ||
                    (firstSelectedWaybill
                      ? `Detail akan diambil dari resi ${firstSelectedWaybill}.`
                      : "Centang minimal satu resi pada daftar di bawah.")}
              </p>
              {!firstSelectedWaybill && <button type="button"
                onClick={focusWaybillTable}
                className="mt-1 text-sm font-semibold text-blue-700 hover:underline">
                Lihat daftar resi
              </button>}
            </div>
          </AppCard>

          <AppCard className="space-y-4 rounded-2xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Informasi Pembayaran
            </p>
            {availableBankAccounts.length === 0 ? <div className="space-y-3">
              <div role="status"
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Rekening penerima pembayaran belum dikonfigurasi.
              </div>
              {canCreate && <button type="button"
                onClick={() => openBankModal()}
                className={nextgenNeutralButtonClass}>
                + Tambah Rekening Penerima
              </button>}
            </div> : <>
              <label className="block text-sm font-semibold text-slate-700">
                Rekening Penerima
                <select aria-label="Rekening Penerima"
                  value={selectedBankAccountId}
                  onChange={(event) => setSelectedBankAccountId(event.target.value)}
                  className={`${nextgenControlClass} mt-1`}
                  disabled={availableBankAccounts.length === 1}>
                  {availableBankAccounts.map((account) => <option key={account.id} value={account.id}>
                    {account.bankName} · {account.accountNumber} · {account.accountHolder}
                  </option>)}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["Nama Bank", selectedBankAccount?.bankName],
                  ["Nomor Rekening", selectedBankAccount?.accountNumber],
                  ["Atas Nama", selectedBankAccount?.accountHolder],
                ].map(([label, value]) => <div key={label}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="mt-1 font-semibold text-slate-950">{value || "—"}</p>
                </div>)}
              </div>
              {canCreate && selectedBankAccount && <button type="button"
                onClick={() => openBankModal(selectedBankAccount)}
                className={nextgenNeutralButtonClass}>
                Ubah
              </button>}
            </>}
            <div className="border-t border-slate-200 pt-4">
              <label className="block text-sm font-semibold text-slate-700">
                WhatsApp Admin Outlet
                <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                  <input
                    aria-label="WhatsApp Admin Outlet"
                    value={adminWhatsapp}
                    maxLength={30}
                    disabled={!canCreate}
                    placeholder="Nomor konfirmasi pembayaran"
                    onChange={(event) => setAdminWhatsapp(event.target.value)}
                    className={nextgenControlClass}
                  />
                  {canCreate && <button
                    type="button"
                    disabled={adminWhatsappSaving}
                    onClick={() => void saveAdminWhatsapp()}
                    className={nextgenNeutralButtonClass}>
                    {adminWhatsappSaving &&
                      <LoaderCircle className="animate-spin" size={17}/>}
                    {adminWhatsappSaving ? "Menyimpan..." : "Simpan Kontak"}
                  </button>}
                </div>
              </label>
              <p className="mt-2 text-xs text-slate-500">
                Kontak outlet ini disimpan sebagai snapshot pada invoice baru.
              </p>
            </div>
          </AppCard>

          <AppCard className="space-y-4 rounded-2xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Detail Invoice
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <input aria-label="Tanggal Invoice" type="date" value={invoiceDate}
                onChange={(event) => setInvoiceDate(event.target.value)}
                className={nextgenControlClass}/>
              <input aria-label="Tanggal Jatuh Tempo" type="date" value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className={nextgenControlClass}/>
              <textarea aria-label="Catatan" placeholder="Catatan invoice" value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className={`${nextgenControlClass} md:col-span-2`}/>
            </div>
          </AppCard>

          {currentInvoice?.id === draftId && <AppCard className="rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Detail Penerima
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Detail diambil dari resi pertama yang valid pada invoice.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div><p className="text-xs text-slate-500">Nama Penerima</p>
                <p className="font-semibold">{currentInvoice.recipientName || "—"}</p></div>
              <div><p className="text-xs text-slate-500">Nomor WhatsApp</p>
                <p className="font-semibold">{currentInvoice.recipientPhone || "—"}</p></div>
              <div><p className="text-xs text-slate-500">Kota/Kabupaten</p>
                <p className="font-semibold">{currentInvoice.recipientCity || "—"}</p></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button"
                disabled={recipientLoadingId === currentInvoice.id}
                onClick={() => void showRecipientDetail(currentInvoice)}
                className={nextgenNeutralButtonClass}>
                {recipientLoadingId === currentInvoice.id &&
                  <LoaderCircle className="animate-spin" size={17}/>}
                {recipientLoadingId === currentInvoice.id
                  ? "Mengambil detail..."
                  : recipientLoadedId === currentInvoice.id
                    ? "Detail penerima ditampilkan"
                    : "Tampilkan Detail Penerima"}
              </button>
              <button type="button"
                disabled={!currentInvoice.recipientPhone}
                title={!currentInvoice.recipientPhone
                  ? "Tampilkan detail penerima terlebih dahulu"
                  : "Chat WA Customer"}
                onClick={() => chatRecipient(currentInvoice)}
                className={nextgenButtonClass}>
                <MessageCircle size={17}/>Chat WA Customer
              </button>
            </div>
          </AppCard>}

          <div ref={waybillTableRef}
            className={`rounded-2xl transition ${
              highlightWaybills ? "ring-4 ring-blue-300 ring-offset-4" : ""
            }`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-950">Daftar Resi Belum Bayar</h3>
                <p className="text-sm text-slate-500">
                  {detailLoading
                    ? "Memuat resi..."
                    : `${selectable.length} resi tersedia dari ${items.length} resi`}
                </p>
              </div>
              {!detailLoading && !itemsError && selectable.length > 0 &&
                <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold">
                  <input aria-label="Pilih Semua" type="checkbox"
                    checked={allSelected} onChange={toggleAll}/>
                  Pilih Semua
                </label>}
            </div>

            {detailLoading ? <AppCard className="grid min-h-44 place-items-center p-5">
              <div className="text-center text-sm text-slate-600">
                <LoaderCircle className="mx-auto mb-2 animate-spin text-blue-700" size={28}/>
                Memuat resi...
              </div>
            </AppCard> : itemsError ? <AppCard className="grid min-h-44 place-items-center border-rose-200 bg-rose-50 p-5 text-center text-sm text-rose-800">
              {itemsError}
            </AppCard> : items.length === 0 ? <AppCard className="grid min-h-44 place-items-center p-5 text-center text-sm text-slate-500">
              Tidak ada resi belum bayar yang dapat dibuat invoice.
            </AppCard> : selectable.length === 0 ? <AppCard className="grid min-h-44 place-items-center border-amber-200 bg-amber-50 p-5 text-center text-sm text-amber-800">
              Seluruh resi seller ini sedang digunakan pada draft atau invoice lain.
            </AppCard> : <TableCard>
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
                    <tr><th className="px-3 py-3">Pilih</th>
                      {["No", "Tanggal", "No Resi", "Staff Pickup", "Pengirim", "Berat", "Jumlah Ongkir", "Diskon", "Final Ongkir", "Status Invoice"]
                        .map((label) => <th key={label} className="px-3 py-3">{label}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y">{items.map((item, index) => <tr key={item.id}>
                    <td className="px-3 py-3"><input aria-label={`Pilih ${item.waybillNumber}`}
                      type="checkbox" disabled={!item.selectable}
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleItem(item.id)}/></td>
                    <td className="px-3 py-3">{index + 1}</td>
                    <td className="px-3 py-3">{displayDate(item.transactionDate)}</td>
                    <td className="px-3 py-3 font-mono">{item.waybillNumber}</td>
                    <td className="px-3 py-3">{item.pickupStaff || "—"}</td>
                    <td className="px-3 py-3">{item.sellerName}</td>
                    <td className="px-3 py-3">{item.weight}</td>
                    <td className="px-3 py-3">{money(item.freightAmount)}</td>
                    <td className="px-3 py-3">{money(item.discountAmount)}</td>
                    <td className="px-3 py-3 font-semibold">{money(item.finalAmount)}</td>
                    <td className="px-3 py-3">{item.draftInvoiceId
                      ? <span className="text-amber-700">Draft existing</span>
                      : <span className="text-emerald-700">Tersedia</span>}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            </TableCard>}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Resi Dipilih" value={`${selectedIds.size} resi`}/>
            <MetricCard label="Subtotal" value={formatRupiahFromCents(selectedSubtotal)}/>
            <MetricCard label="Total Invoice" value={formatRupiahFromCents(selectedTotal)}/>
          </div>
          <AppCard className="p-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <span>Total diskon dipilih</span>
              <strong>{formatRupiahFromCents(selectedDiscount)}</strong>
            </div>
          </AppCard>

          {canCreate && <div className="flex flex-wrap justify-end gap-3">
            {!selectedIds.size && <p className="w-full text-right text-sm text-amber-700">
              Pilih minimal satu resi untuk membuat draft invoice.
            </p>}
            <button type="button"
              disabled={!draftCanBeSaved}
              onClick={() => void saveDraft()} className={nextgenNeutralButtonClass}>
              {saving ? <LoaderCircle className="animate-spin" size={17}/> : <Save size={17}/>}
              {saving ? "Menyimpan..." : draftId ? "Simpan Perubahan" : "Simpan Draft"}
            </button>
            {canIssue && draftId && <button type="button" disabled={issuing}
              onClick={() => void issueCurrentInvoice()} className={nextgenButtonClass}>
              {issuing ? <LoaderCircle className="animate-spin" size={17}/> : <Send size={17}/>}
              {issuing ? "Memfinalisasi..." : "Finalisasi Invoice"}
            </button>}
          </div>}
        </div>}
      </SectionCard>
    </section>

    <SectionCard title="Daftar Invoice">
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_220px_auto]">
        <input placeholder="Nomor invoice atau seller" value={invoiceSearch}
          onChange={(event) => setInvoiceSearch(event.target.value)} className={nextgenControlClass}/>
        <select value={invoiceStatus} onChange={(event) => setInvoiceStatus(event.target.value)}
          className={nextgenControlClass}>
          <option value="">Semua status</option>
          {["DRAFT", "ISSUED", "SENT", "PARTIALLY_PAID", "PAID", "CANCELLED", "VOID"]
            .map((status) => <option key={status}>{status}</option>)}
        </select>
        <button type="button" onClick={() => void loadInvoices()} className={nextgenNeutralButtonClass}>Cari</button>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>
          {["Nomor Invoice", "Seller", "Periode", "Jumlah Resi", "Total", "Status", "Tanggal Invoice", "Jatuh Tempo", "Aksi"]
            .map((label) => <th key={label} className="px-3 py-3">{label}</th>)}
        </tr></thead>
        <tbody className="divide-y">{invoices.map((invoice) => <tr key={invoice.id}>
          <td className="px-3 py-3 font-semibold">{invoice.invoiceNumber || "DRAFT"}</td>
          <td className="px-3 py-3">{invoice.customerNameSnapshot}</td>
          <td className="px-3 py-3">{displayDate(invoice.periodStart)} – {displayDate(invoice.periodEnd)}</td>
          <td className="px-3 py-3">{invoice._count?.items ?? invoice.items?.length ?? 0}</td>
          <td className="px-3 py-3">{money(invoice.grandTotal)}</td>
          <td className="px-3 py-3">{invoice.status}</td>
          <td className="px-3 py-3">{displayDate(invoice.invoiceDate)}</td>
          <td className="px-3 py-3">{displayDate(invoice.dueDate)}</td>
          <td className="px-3 py-3"><div className="flex gap-2">
            <button title={invoice.status === "DRAFT" ? "Buka Draft" : "Preview"}
              onClick={() => void openInvoice(invoice.id)} className={nextgenNeutralButtonClass}>
              {invoice.status === "DRAFT" ? <ReceiptText size={16}/> : <Eye size={16}/>}
            </button>
            {canExport && ["DRAFT", "ISSUED", "SENT", "PARTIALLY_PAID", "PAID"].includes(invoice.status) &&
              <button title="Export PDF" disabled={Boolean(pdfLoadingId)}
                onClick={() => void exportPdf(invoice)} className={nextgenNeutralButtonClass}>
                {pdfLoadingId === invoice.id ? <LoaderCircle className="animate-spin" size={16}/> : <Download size={16}/>}
                <span>{pdfLoadingId === invoice.id
                  ? "Membuat PDF..."
                  : invoice.status === "DRAFT" ? "Preview PDF" : "Export PDF"}</span>
              </button>}
            {canWhatsapp && <button
              title={invoiceWhatsappDisabledReason({
                status: invoice.status,
                whatsapp: invoice.whatsappSnapshot,
              }) || "Kirim WhatsApp"}
              disabled={Boolean(invoiceWhatsappDisabledReason({
                status: invoice.status,
                whatsapp: invoice.whatsappSnapshot,
              }))}
              onClick={() => void prepareWhatsapp(invoice)}
              className={nextgenNeutralButtonClass}>
              <MessageCircle size={16}/>
            </button>}
            {canVoid &&
              ["DRAFT", "ISSUED", "SENT", "PARTIALLY_PAID"].includes(invoice.status) &&
              <button title="Void Invoice" onClick={() => openVoidModal(invoice)}
                className={nextgenNeutralButtonClass}><X size={16}/></button>}
          </div></td>
        </tr>)}</tbody>
      </table></div>
    </SectionCard>

    {voidInvoiceTarget && <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !voidSaving) closeVoidModal();
      }}>
      <ModalCard className="w-full max-w-lg" >
        <div role="dialog" aria-modal="true" aria-labelledby="void-invoice-title">
          <div className="flex items-start justify-between border-b p-5">
            <div>
              <h2 id="void-invoice-title" className="text-xl font-bold text-slate-950">
                Batalkan Invoice
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Invoice {voidInvoiceTarget.invoiceNumber || "DRAFT"} akan dibatalkan
                dan tidak dapat digunakan kembali.
              </p>
            </div>
            <button type="button" aria-label="Tutup modal"
              disabled={voidSaving} onClick={closeVoidModal}
              className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
              <X size={20}/>
            </button>
          </div>
          <div className="p-5">
            <label className="block text-sm font-semibold text-slate-700">
              Alasan Pembatalan
              <textarea
                autoFocus
                aria-label="Alasan Pembatalan"
                rows={4}
                maxLength={500}
                value={voidReason}
                disabled={voidSaving}
                placeholder="Tuliskan alasan pembatalan invoice"
                onChange={(event) => {
                  setVoidReason(event.target.value);
                  setVoidError("");
                }}
                className={`${nextgenControlClass} mt-1 resize-y`}
              />
            </label>
            <div className="mt-1 flex justify-between gap-3 text-xs">
              <p role={voidError ? "alert" : undefined} className="text-rose-700">
                {voidError}
              </p>
              <span className="ml-auto text-slate-500">{voidReason.length}/500</span>
            </div>
          </div>
          <div className="flex flex-col-reverse justify-end gap-3 border-t p-4 sm:flex-row">
            <button type="button" disabled={voidSaving}
              onClick={closeVoidModal}
              className={`${nextgenNeutralButtonClass} w-full sm:w-auto`}>
              Batal
            </button>
            <button type="button" disabled={voidSaving}
              onClick={() => void submitVoidInvoice()}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
              {voidSaving && <LoaderCircle className="animate-spin" size={17}/>}
              {voidSaving ? "Membatalkan..." : "Batalkan Invoice"}
            </button>
          </div>
        </div>
      </ModalCard>
    </div>}

    {bankModalOpen && <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
      <ModalCard className="w-full max-w-lg">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <p className="text-sm text-slate-500">Informasi Pembayaran</p>
            <h2 className="text-xl font-bold">
              {editingBankAccountId
                ? "Ubah Rekening Penerima"
                : "Tambah Rekening Penerima"}
            </h2>
          </div>
          <button type="button" disabled={bankSaving}
            onClick={() => setBankModalOpen(false)}><X/></button>
        </div>
        <div className="space-y-4 p-5">
          {bankError && <div role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {bankError}
          </div>}
          <label className="block text-sm font-semibold text-slate-700">
            Nama Bank
            <input aria-label="Nama Bank Rekening Penerima" value={bankName}
              maxLength={100}
              onChange={(event) => setBankName(event.target.value)}
              className={`${nextgenControlClass} mt-1`}/>
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Nomor Rekening
            <input aria-label="Nomor Rekening Penerima"
              value={accountNumber} maxLength={100}
              inputMode="numeric"
              onChange={(event) => setAccountNumber(event.target.value)}
              className={`${nextgenControlClass} mt-1`}/>
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Atas Nama
            <input aria-label="Atas Nama Rekening Penerima"
              value={accountHolder} maxLength={200}
              onChange={(event) => setAccountHolder(event.target.value)}
              className={`${nextgenControlClass} mt-1`}/>
          </label>
          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 px-3 text-sm font-semibold">
            <input type="checkbox" checked={makeDefaultAccount}
              disabled={editingBankAccountId !== "" &&
                Boolean(selectedBankAccount?.isDefault)}
              onChange={(event) => setMakeDefaultAccount(event.target.checked)}/>
            Jadikan rekening utama
          </label>
        </div>
        <div className="flex justify-end gap-3 border-t p-4">
          <button type="button" disabled={bankSaving}
            onClick={() => setBankModalOpen(false)}
            className={nextgenNeutralButtonClass}>
            Batal
          </button>
          <button type="button" disabled={bankSaving}
            onClick={() => void saveBankAccount()}
            className={nextgenButtonClass}>
            {bankSaving && <LoaderCircle className="animate-spin" size={17}/>}
            {bankSaving ? "Menyimpan..." : "Simpan Rekening"}
          </button>
        </div>
      </ModalCard>
    </div>}

    {currentInvoice && currentInvoice.status !== "DRAFT" &&
      <InvoicePreview invoice={currentInvoice} onClose={() => setCurrentInvoice(null)}
        onPdf={canExport ? exportPdf : undefined}
        onChat={canWhatsapp ? chatRecipient : undefined}
        loadingPdf={pdfLoadingId === currentInvoice.id}/>}
  </div>;
}

function InvoicePreview({
  invoice, onClose, onPdf, onChat, loadingPdf,
}: {
  invoice: Invoice;
  onClose: () => void;
  onPdf?: (invoice: Invoice) => Promise<void>;
  onChat?: (invoice: Invoice) => void;
  loadingPdf: boolean;
}) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
    <ModalCard className="max-h-[92vh] max-w-6xl overflow-y-auto">
      <div className="flex items-center justify-between border-b p-5">
        <div><p className="text-sm text-slate-500">Preview Invoice</p>
          <h2 className="text-xl font-bold">{invoice.invoiceNumber}</h2></div>
        <button type="button" onClick={onClose}><X/></button>
      </div>
      <div className="space-y-5 p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <AppCard className="rounded-2xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Detail Penerima
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
              <div><p className="text-xs text-slate-500">Nama Penerima</p>
                <p className="font-semibold">{invoice.recipientName || "—"}</p></div>
              <div><p className="text-xs text-slate-500">Nomor WhatsApp</p>
                <p className="font-semibold">{invoice.recipientPhone || "—"}</p></div>
              <div><p className="text-xs text-slate-500">Kota/Kabupaten</p>
                <p className="font-semibold">{invoice.recipientCity || "—"}</p></div>
            </div>
          </AppCard>
          <AppCard className="p-4 text-sm"><p>Tanggal: {displayDate(invoice.invoiceDate)}</p>
            <p>Jatuh tempo: {displayDate(invoice.dueDate)}</p>
            <p>Periode: {displayDate(invoice.periodStart)} – {displayDate(invoice.periodEnd)}</p></AppCard>
        </div>
        <AppCard className="rounded-2xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Informasi Customer
          </p>
           <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
             {[
               ["Nama Perusahaan", invoice.companyNameSnapshot],
               ["Email", invoice.emailSnapshot],
               ["Alamat", invoice.addressSnapshot],
               ["Catatan", invoice.notes],
             ].map(([label, value]) => <div key={label}>
              <p className="text-xs text-slate-500">{label}</p>
              <p className="font-medium">{value || "—"}</p>
            </div>)}
           </div>
         </AppCard>
         <AppCard className="rounded-2xl border border-slate-200 p-4 shadow-sm">
           <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
             Informasi Pembayaran
           </p>
           <div className="mt-3 grid gap-3 sm:grid-cols-3">
             {[
               ["Nama Bank", invoice.transferBankName],
               ["Nomor Rekening", invoice.transferAccountNumber],
               ["Atas Nama", invoice.transferAccountHolder],
             ].map(([label, value]) => <div key={label}>
               <p className="text-xs text-slate-500">{label}</p>
               <p className="font-medium">{value || "—"}</p>
             </div>)}
           </div>
         </AppCard>
        <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-slate-50"><tr>{["No", "Tanggal", "No Resi", "Staff", "Pengirim", "Berat", "Ongkir", "Diskon", "Final"]
            .map((label) => <th key={label} className="px-3 py-2">{label}</th>)}</tr></thead>
          <tbody className="divide-y">{invoice.items.map((item, index) => <tr key={item.id}>
            <td className="px-3 py-2">{index + 1}</td><td className="px-3 py-2">{displayDate(item.transactionDate)}</td>
            <td className="px-3 py-2">{item.waybillNumber}</td><td className="px-3 py-2">{item.pickupStaff || "—"}</td>
            <td className="px-3 py-2">{item.sellerNameSnapshot}</td><td className="px-3 py-2">{item.weight}</td>
            <td className="px-3 py-2">{money(item.freightAmount)}</td><td className="px-3 py-2">{money(item.discountAmount)}</td>
            <td className="px-3 py-2 font-semibold">{money(item.finalAmount)}</td>
          </tr>)}</tbody>
        </table></div>
        <div className="ml-auto max-w-sm space-y-1 text-right">
          <p>Jumlah resi: {invoice.items.length}</p>
          <p>Subtotal: {money(invoice.subtotal)}</p>
          <p>Total diskon: {money(invoice.discountTotal)}</p>
          <p className="text-lg font-bold">Total tagihan: {money(invoice.grandTotal)}</p>
        </div>
      </div>
      <div className="flex justify-end gap-3 border-t p-4">
        {onPdf && <button type="button" disabled={loadingPdf}
          onClick={() => void onPdf(invoice)} className={nextgenNeutralButtonClass}>
          {loadingPdf ? <LoaderCircle className="animate-spin" size={17}/> : <FileCheck2 size={17}/>}
          {loadingPdf ? "Membuat PDF..." : "Export PDF"}
        </button>}
        {onChat && <button type="button"
          disabled={!invoice.recipientPhone}
          title={!invoice.recipientPhone
            ? "Tampilkan detail penerima terlebih dahulu"
            : "Chat WA Customer"}
          onClick={() => onChat(invoice)}
          className={nextgenButtonClass}>
          <MessageCircle size={17}/>Chat WA Customer
        </button>}
      </div>
    </ModalCard>
  </div>;
}
