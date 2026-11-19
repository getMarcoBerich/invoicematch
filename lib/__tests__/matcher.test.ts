import { describe, expect, it } from "vitest";
import path from "path";
import { parseExcelFile } from "@/lib/excel/parser";
import { invoiceNumbersMatch, extractInvoiceNumbersFromText } from "@/lib/matching/invoice-number";
import { scorePair } from "@/lib/matching/scorer";

describe("Excel parser", () => {
  it("parses za json.xlsx with 6 invoices and 6 payments", async () => {
    const filePath = path.join(process.cwd(), "za json.xlsx");
    const result = await parseExcelFile(filePath);

    expect(result.invoices).toHaveLength(6);
    expect(result.payments).toHaveLength(6);
    expect(result.sheetName).toBe("KARTICA");
  });

  it("normalizes invoice numbers and dates", async () => {
    const filePath = path.join(process.cwd(), "za json.xlsx");
    const result = await parseExcelFile(filePath);

    const invoice = result.invoices.find((i) => i.invoiceNumber === "2/DBA/1");
    expect(invoice).toBeDefined();
    expect(invoice!.invoiceDate).toBe("2026-03-11");
    expect(invoice!.total).toBe(100);
  });

  it("parses compact KARTICA layout (failed.xlsx)", async () => {
    const filePath = path.join(process.cwd(), "failed.xlsx");
    const result = await parseExcelFile(filePath);

    expect(result.invoices.length).toBe(70);
    expect(result.payments.length).toBe(50);

    const invoice = result.invoices[0];
    expect(invoice.invoiceNumber).toBe("101/RAC/26");
    expect(invoice.total).toBe(1146.18);

    const payment = result.payments[0];
    expect(payment.amount).toBe(512.3);
    expect(payment.client).toBe("TEHNOGRAD d.o.o.");
    expect(payment.description).toContain("102/MED/25");
  });
});

describe("Invoice number extraction", () => {
  it("extracts numbers from payment descriptions", () => {
    expect(extractInvoiceNumbersFromText("Ponuda 44/HQX/25")).toContain("44/HQX/25");
    expect(extractInvoiceNumbersFromText("Račun br. 12/HQX/26")).toContain("12/HQX/26");
    expect(extractInvoiceNumbersFromText("Račun br. 2/DBA/1")).toContain("2/DBA/1");
  });

  it("matches invoice numbers in descriptions", () => {
    expect(invoiceNumbersMatch("2/DBA/1", "Račun br. 2/DBA/1")).toBe(true);
    expect(invoiceNumbersMatch("128/RAC/25", "UR HORWATH br. 128/RAC/25")).toBe(true);
    expect(invoiceNumbersMatch("116/RAC/25", "UR HORWATH br. 128/RAC/25")).toBe(false);
    expect(invoiceNumbersMatch("285/HQX/1", "Račun br. 12/HQX/26")).toBe(false);
  });
});

describe("Scorer", () => {
  it("matches clients with same payer key but different names", () => {
    const result = scorePair(
      {
        id: "inv1",
        invoiceNumber: "2/DBA/1",
        invoiceDate: "2026-03-11",
        clientNormalized: "HORWATH I HORWATH CONSULTING ZAGREB D.O.O.",
        payerKey: "HORWATH",
        total: 100,
      },
      {
        id: "pay1",
        paymentDate: "2026-03-11",
        clientNormalized: "HORWATH CONSULTING ZAGREB D.O.O.",
        payerKey: "HORWATH",
        amount: 100,
        description: "Račun br. 2/DBA/1",
      },
    );

    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(75);
  });

  it("scores strong amount + client + invoice number match highly", () => {
    const result = scorePair(
      {
        id: "inv1",
        invoiceNumber: "2/DBA/1",
        invoiceDate: "2026-03-11",
        clientNormalized: "HORWATH I HORWATH CONSULTING ZAGREB D.O.O.",
        payerKey: "HORWATH I HORWATH CONSULTING ZAGREB D.O.O.",
        total: 100,
      },
      {
        id: "pay1",
        paymentDate: "2026-03-11",
        clientNormalized: "HORWATH I HORWATH CONSULTING ZAGREB D.O.O.",
        payerKey: "HORWATH I HORWATH CONSULTING ZAGREB D.O.O.",
        amount: 100,
        description: "Račun br. 2/DBA/1",
      },
    );

    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(75);
  });

  it("matches by amount and client when totals align", () => {
    const result = scorePair(
      {
        id: "inv1",
        invoiceNumber: "985/HQX/1",
        invoiceDate: "2025-05-14",
        clientNormalized: "HORWATH I HORWATH CONSULTING ZAGREB D.O.O.",
        payerKey: "HORWATH I HORWATH CONSULTING ZAGREB D.O.O.",
        total: 177.38,
      },
      {
        id: "pay1",
        paymentDate: "2025-04-28",
        clientNormalized: "HORWATH I HORWATH CONSULTING ZAGREB D.O.O.",
        payerKey: "HORWATH I HORWATH CONSULTING ZAGREB D.O.O.",
        amount: 177.38,
        description: "Ponuda 44/HQX/25",
      },
    );

    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(75);
  });

  it("matches the same amount and client when the description cites another invoice", () => {
    const miroslav = scorePair(
      {
        id: "inv-miroslav",
        invoiceNumber: "2394/HQX/1",
        invoiceDate: "2026-10-01",
        clientNormalized: "MIROSLAV HANŽEVAČKI",
        payerKey: "MIROSLAV HANŽEVAČKI",
        total: 400,
      },
      {
        id: "pay-miroslav",
        paymentDate: "2026-10-05",
        clientNormalized: "MIROSLAV HANŽEVAČKI",
        payerKey: "MIROSLAV HANŽEVAČKI",
        amount: 400,
        description: "Racun za 7/21",
      },
    );
    const transbay = scorePair(
      {
        id: "inv-transbay",
        invoiceNumber: "2409/HQX/1",
        invoiceDate: "2026-10-03",
        clientNormalized: "TRANSBAY D.O.O.",
        payerKey: "TRANSBAY D.O.O.",
        total: 1150,
      },
      {
        id: "pay-transbay",
        paymentDate: "2026-10-08",
        clientNormalized: "TRANSBAY D.O.O.",
        payerKey: "TRANSBAY D.O.O.",
        amount: 1150,
        description: "Uplata po racunu 512/01/261",
      },
    );

    expect(miroslav!.confidence).toBeGreaterThanOrEqual(75);
    expect(transbay!.confidence).toBeGreaterThanOrEqual(75);
  });

  it("does not match the same amount for a different client without the invoice number", () => {
    const result = scorePair(
      {
        id: "inv-transbay",
        invoiceNumber: "2409/HQX/1",
        invoiceDate: "2026-10-03",
        clientNormalized: "TRANSBAY D.O.O.",
        payerKey: "TRANSBAY D.O.O.",
        total: 1150,
      },
      {
        id: "pay-other",
        paymentDate: "2026-10-08",
        clientNormalized: "DRUGI KLIJENT D.O.O.",
        payerKey: "DRUGI KLIJENT D.O.O.",
        amount: 1150,
        description: "Uplata po racunu 512/01/261",
      },
    );

    expect(result!.confidence).toBeLessThan(75);
  });
});
