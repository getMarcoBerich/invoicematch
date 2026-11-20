import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { planSessionUpdate, previewSessionUpdate, applySessionUpdate } from "@/lib/services/session-update";
import { importExcelFile, getSessionRecords } from "@/lib/services/session";
import { createManualMatch } from "@/lib/matching/engine";
import { clearAllData } from "@/lib/storage/db";
import type { ParsedInvoice, ParsedPayment, ParseResult } from "@/lib/excel/parser";

function invoice(partial: Partial<ParsedInvoice> & Pick<ParsedInvoice, "invoiceNumber">): ParsedInvoice {
  return {
    invoiceDate: "2026-01-01",
    client: "Klijent",
    clientNormalized: "KLIJENT",
    baseAmount: 100,
    vat: 25,
    total: 125,
    rowHash: partial.invoiceNumber,
    sourceRow: 2,
    ...partial,
  };
}

function payment(partial: Partial<ParsedPayment> & Pick<ParsedPayment, "rowHash">): ParsedPayment {
  return {
    paymentDate: "2026-01-02",
    amount: 125,
    client: "Klijent",
    clientNormalized: "KLIJENT",
    description: "opis",
    sourceRow: 3,
    ...partial,
  };
}

function parsed(invoices: ParsedInvoice[], payments: ParsedPayment[]): ParseResult {
  return { invoices, payments, warnings: [], sheetName: "Kartica" };
}

describe("planSessionUpdate", () => {
  it("adds new rows and updates the same invoice number without dropping rows missing from the file", () => {
    const plan = planSessionUpdate({
      sessionId: "s1",
      filename: "novo.xlsx",
      invoices: [
        {
          id: "inv-1",
          invoiceNumber: "1/2026",
          invoiceDate: "2026-01-01",
          client: "Klijent",
          baseAmount: 100,
          vat: 25,
          total: 125,
        },
      ],
      payments: [
        { id: "pay-kept", rowHash: "old" },
        { id: "pay-gone", rowHash: "gone" },
      ],
      parsed: parsed(
        [invoice({ invoiceNumber: "1/2026", total: 200, rowHash: "changed" }), invoice({ invoiceNumber: "2/2026" })],
        [payment({ rowHash: "new" })],
      ),
    });

    expect(plan.counts).toEqual({
      addedInvoices: 1,
      addedPayments: 1,
      updatedInvoices: 1,
    });
    expect(plan.invoiceUpdates[0]?.id).toBe("inv-1");
    expect(plan.invoiceAdds.map((row) => row.invoiceNumber)).toEqual(["2/2026"]);
    expect(plan.paymentAdds.map((row) => row.rowHash)).toEqual(["new"]);
  });

  it("keeps the existing match when a later workbook changes that invoice and adds a row", async () => {
    await clearAllData();
    const original = await workbook([
      ["12/2026", "15.01.2026", "Klijent 1", 1000, "", "", "15.01.2026", 1000, "Klijent 1", "Uplata 12/2026"],
      ["13/2026", "20.01.2026", "Klijent 2", 500, "", "", "22.01.2026", 400, "Klijent 2", "Djelomično"],
    ]);
    const imported = await importExcelFile("prvo.xlsx", original);
    const before = await getSessionRecords(imported.sessionId);
    const invoice = before.records.find((row) => row.invoice?.invoiceNumber === "12/2026")?.invoice;
    const payment = before.records.find((row) => row.payment?.description === "Uplata 12/2026")?.payment;
    expect(invoice && payment).toBeTruthy();
    await createManualMatch(imported.sessionId, invoice!.id, payment!.id);

    const next = await workbook([
      ["12/2026", "15.01.2026", "Klijent 1", 1100, "", "", "15.01.2026", 1000, "Klijent 1", "Uplata 12/2026"],
      ["99/2026", "01.02.2026", "Klijent 3", 300, "", "", "02.02.2026", 300, "Klijent 3", "Uplata 99/2026"],
    ]);
    const preview = await previewSessionUpdate(imported.sessionId, "drugo.xlsx", next);

    expect(preview.counts.addedInvoices).toBe(1);
    expect(preview.counts.addedPayments).toBe(1);
    expect(preview.counts.updatedInvoices).toBe(1);
    expect(preview.invoiceUpdates[0]?.id).toBe(invoice!.id);

    await applySessionUpdate(preview);
    const after = await getSessionRecords(imported.sessionId);
    const updated = after.records.find((row) => row.invoice?.id === invoice!.id);
    expect(updated?.invoice?.total).toBe(1100);
    expect(updated?.matchId).toBeTruthy();
    expect(updated?.payment?.id).toBe(payment!.id);
    expect(after.records.some((row) => row.invoice?.invoiceNumber === "99/2026")).toBe(true);
    expect(after.records.some((row) => row.invoice?.invoiceNumber === "13/2026")).toBe(true);
    expect(after.records.some((row) => row.payment?.description === "Djelomično")).toBe(true);
    expect(after.session.filename).toBe("drugo.xlsx");
    expect(after.session.updatedAt).toBeInstanceOf(Date);
  });
});

async function workbook(rows: (string | number)[][]) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Kartica");
  sheet.addRow(["Broj", "Datum", "Klijent", "TOTAL", "", "", "Datum", "Iznos", "Klijent", "Opis plaćanja"]);
  for (const row of rows) sheet.addRow(row);
  const buffer = await book.xlsx.writeBuffer();
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
