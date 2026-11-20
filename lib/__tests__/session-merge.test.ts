import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { createManualMatch } from "@/lib/matching/engine";
import { getSessionRecords, importExcelFile, listSessionSummaries, mergeSessions } from "@/lib/services/session";
import { clearAllData, getDb } from "@/lib/storage/db";

describe("mergeSessions", () => {
  it("keeps both sessions' rows, collapses the same invoice and payment, and removes the source session", async () => {
    await clearAllData();
    const first = await importExcelFile(
      "prva.xlsx",
      await workbook([
        ["12/2026", "15.01.2026", "Klijent 1", 1000, "", "", "15.01.2026", 1000, "Klijent 1", "Uplata 12/2026"],
        ["13/2026", "20.01.2026", "Klijent 2", 500, "", "", "22.01.2026", 400, "Klijent 2", "Djelomično"],
      ]),
    );
    const second = await importExcelFile(
      "druga.xlsx",
      await workbook([
        ["12/2026", "15.01.2026", "Klijent 1", 1000, "", "", "15.01.2026", 1000, "Klijent 1", "Uplata 12/2026"],
        ["99/2026", "01.02.2026", "Klijent 3", 300, "", "", "02.02.2026", 300, "Klijent 3", "Uplata 99/2026"],
      ]),
    );

    const before = await getSessionRecords(first.sessionId);
    const invoice = before.records.find((row) => row.invoice?.invoiceNumber === "12/2026")?.invoice;
    const payment = before.records.find((row) => row.payment?.description === "Uplata 12/2026")?.payment;
    const other = await getSessionRecords(second.sessionId);
    const otherInvoice = other.records.find((row) => row.invoice?.invoiceNumber === "12/2026")?.invoice;
    const otherPayment = other.records.find((row) => row.payment?.description === "Uplata 12/2026")?.payment;
    await createManualMatch(first.sessionId, invoice!.id, payment!.id);
    await createManualMatch(second.sessionId, otherInvoice!.id, otherPayment!.id);

    await mergeSessions(first.sessionId, second.sessionId);

    const after = await getSessionRecords(first.sessionId);
    const numbers = after.records.flatMap((row) => (row.invoice ? [row.invoice.invoiceNumber] : []));
    expect(numbers.filter((number) => number === "12/2026")).toHaveLength(1);
    expect(numbers).toContain("13/2026");
    expect(numbers).toContain("99/2026");
    expect(
      after.records.filter((row) => row.payment?.description === "Uplata 12/2026"),
    ).toHaveLength(1);
    expect(after.records.some((row) => row.payment?.description === "Djelomično")).toBe(true);
    expect(after.records.some((row) => row.payment?.description === "Uplata 99/2026")).toBe(true);
    const kept = after.records.find((row) => row.invoice?.id === invoice!.id);
    expect(kept?.matchId).toBeTruthy();
    expect(kept?.payment?.id).toBe(payment!.id);
    expect(await getDb().importSessions.get(second.sessionId)).toBeUndefined();
    expect(await listSessionSummaries()).toHaveLength(1);
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
