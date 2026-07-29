import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const client = readFileSync(new URL("./operational-settlement-client.tsx", import.meta.url), "utf8");
const service = readFileSync(new URL("../../modules/operational-settlement/operational-settlement.service.ts", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../layout/sidebar.tsx", import.meta.url), "utf8");
const schema = readFileSync(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");

describe("Operational Settlement vertical slice", () => {
  it("shows the submenu after Pickup and Delivery", () => {
    expect(sidebar.indexOf("Pickup Settlement")).toBeLessThan(sidebar.indexOf("Delivery Settlement"));
    expect(sidebar.indexOf("Delivery Settlement")).toBeLessThan(sidebar.indexOf("Operational Settlement"));
    expect(sidebar).toContain('href="/dashboard/settlement/operational"');
  });

  it.each(["Cash Diterima", "Pengeluaran Operasional", "Cash Tersedia", "Transfer Diterima", "Belum Diterima"])(
    "renders card %s",
    (label) => expect(client).toContain(label),
  );

  it("defaults to Jakarta today and exposes all requested filters", () => {
    expect(client).toContain("useState(jakartaOperationalDate)");
    for (const label of ["Tanggal", "Kategori", "Nama Team", "Search", "Jumlah baris"]) {
      expect(client).toContain(`aria-label="${label}"`);
    }
  });

  it("renders conditional BBM and Kasbon fields", () => {
    expect(client).toContain('formCategory === "BBM"');
    expect(client).toContain("Nomor Polisi");
    expect(client).toContain('formCategory === "Kasbon"');
    expect(client).toContain("Kategori Kasbon");
    expect(client).not.toContain("Odometer");
    expect(client).not.toContain("Liter");
  });

  it("supports edit and void without hard delete", () => {
    expect(client).toContain("Edit");
    expect(client).toContain(">Void</button>");
    expect(service).toContain('status: "VOID"');
    expect(service).not.toContain("operationalExpense.delete");
  });

  it("renders physical cash, variance, close, and reason-required reopen", () => {
    expect(client).toContain("Physical Cash");
    expect(client).toContain("Cash Variance");
    expect(client).toContain("Tutup Operasional");
    expect(client).toContain("Buka Kembali");
    expect(client).toContain("reopenReason.trim().length < 3");
  });

  it("uses Serializable transactions, request keys, and required audit events", () => {
    expect(service).toContain("TransactionIsolationLevel.Serializable");
    expect(service).toContain("operationalActionRequest");
    for (const event of ["OPERATIONAL_EXPENSE_CREATED", "OPERATIONAL_EXPENSE_UPDATED", "OPERATIONAL_EXPENSE_VOID", "OPERATIONAL_CLOSED", "OPERATIONAL_REOPENED"]) {
      expect(service).toContain(event);
    }
  });

  it("adds only operational models without modifying settlement model names", () => {
    expect(schema).toContain("model OperationalExpense");
    expect(schema).toContain("model OperationalClosing");
    expect(schema).toContain("model OperationalActionRequest");
    expect(schema).toContain("model MasterPickup");
    expect(schema).toContain("model MasterSetoran");
  });
});
