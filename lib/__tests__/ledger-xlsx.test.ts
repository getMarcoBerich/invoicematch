import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildLedgerXlsx, ledgerXlsxFilename } from "@/lib/export/ledger-xlsx";
import type { ClientLedger } from "@/lib/ledger";

function ledger(label: string, lines: ClientLedger["lines"]): ClientLedger {
  const invoiced = lines.reduce((sum, line) => sum + line.debit, 0);
  const paid = lines.reduce((sum, line) => sum + line.credit, 0);
  return {
    payerKey: label.toUpperCase(),
    clients: [label],
    label,
    invoiceCount: lines.filter((line) => line.kind === "invoice").length,
    paymentCount: lines.filter((line) => line.kind === "payment").length,
    invoiced,
    paid,
    balance: invoiced - paid,
    lines,
  };
}

const alfa = ledger("Klijent Alfa", [
  {
    id: "inv-1",
    kind: "invoice",
    date: "2026-01-15",
    client: "Klijent Alfa",
    document: "1/2026",
    debit: 1000,
    credit: 0,
    balance: 1000,
    openAmount: 0,
    daysOpen: null,
  },
  {
    id: "pay-1",
    kind: "payment",
    date: "2026-01-20",
    client: "Klijent Alfa",
    document: "Uplata 1",
    debit: 0,
    credit: 400,
    balance: 600,
    openAmount: 0,
    daysOpen: null,
  },
]);

describe("buildLedgerXlsx", () => {
  it("writes one company sheet with the invoice and payment table", async () => {
    const beta = ledger("Klijent/Beta", [
      {
        id: "inv-2",
        kind: "invoice",
        date: "2026-02-05",
        client: "Klijent/Beta",
        document: "3/2026",
        debit: 500,
        credit: 0,
        balance: 500,
        openAmount: 0,
        daysOpen: null,
      },
    ]);

    const buffer = await buildLedgerXlsx([alfa, beta]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Klijent Alfa", "Klijent Beta"]);

    const card = workbook.getWorksheet("Klijent Alfa")!;
    expect(card.getCell("A1").value).toBe("Klijent Alfa");
    expect(card.getCell("A2").value).toBe("Datum");
    expect(card.getCell("C3").value).toBe("1/2026");
    expect(card.getCell("B3").value).toBe("Račun");
    expect(card.getCell("D3").value).toBe(1000);
    expect(card.getCell("A4").value).toBeInstanceOf(Date);
    expect(card.getCell("C4").value).toBe("Uplata 1");
    expect(card.getCell("E4").value).toBe(400);
    expect(card.getCell("F4").value).toBe(600);
    expect(card.getCell("F5").value).toMatchObject({
      formula: "SUM(D3:D4)-SUM(E3:E4)",
    });
  });

  it("keeps duplicate client sheet names unique", async () => {
    const copy = ledger("Klijent Alfa", []);
    const buffer = await buildLedgerXlsx([alfa, copy]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Klijent Alfa",
      "Klijent Alfa (2)",
    ]);
  });
});

describe("ledgerXlsxFilename", () => {
  it("builds a safe xlsx name from the session and client", () => {
    expect(ledgerXlsxFilename("Siječanj 2026")).toBe("konto-kartice-Siječanj 2026.xlsx");
    expect(ledgerXlsxFilename("A/B:C", "Klijent?")).toBe("konto-kartice-A B C-Klijent.xlsx");
  });
});
