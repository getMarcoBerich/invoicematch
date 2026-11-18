import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { parseExcelBuffer } from "@/lib/excel/parser";
import { findRemainderAllocations } from "@/lib/matching/allocate";
import { findBestMatches } from "@/lib/matching/scorer";
import { suggestPayerKeys } from "@/lib/clients/suggest-keys";
import { normalizeClient } from "@/lib/clients/payer-keys";

describe("practice workbook", () => {
  it("imports the eight exercises and auto-matches the intended cases", async () => {
    const buffer = fs.readFileSync(path.join(process.cwd(), "primjer-vjezba.xlsx"));
    const parsed = await parseExcelBuffer(buffer);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.invoices.map((invoice) => invoice.invoiceNumber)).toEqual([
      "41/2026",
      "31/2026",
      "11/2026",
      "12/2026",
      "51/2026",
      "21/2026",
      "61/2026",
      "71/2025",
    ]);
    expect(parsed.payments.map((payment) => payment.amount)).toEqual([560, 1249.2, 650, 300, 90, 420]);

    const invoices = parsed.invoices.map((invoice) => ({
      id: invoice.invoiceNumber,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      clientNormalized: invoice.clientNormalized,
      payerKey: normalizeClient(invoice.client),
      total: invoice.total,
    }));
    const payments = parsed.payments.map((payment, index) => ({
      id: `p${index}`,
      paymentDate: payment.paymentDate,
      clientNormalized: payment.clientNormalized,
      payerKey: normalizeClient(payment.client),
      amount: payment.amount,
      description: payment.description,
    }));

    const direct = findBestMatches(invoices, payments);
    const usedInvoices = new Set(direct.map((match) => match.invoiceId));
    const usedPayments = new Set(direct.map((match) => match.paymentId));
    const remainder = findRemainderAllocations(
      invoices.filter((invoice) => !usedInvoices.has(invoice.id)),
      payments.filter((payment) => !usedPayments.has(payment.id)),
    );

    expect(direct.map((match) => match.invoiceId).sort()).toEqual(["31/2026", "41/2026", "61/2026"]);
    expect(remainder.map((match) => `${match.invoiceId}:${match.allocatedAmount}`).sort()).toEqual([
      "11/2026:400",
      "12/2026:250",
      "21/2026:300",
    ]);

    const suggestions = suggestPayerKeys(
      [...new Set(parsed.invoices.map((invoice) => invoice.client).concat(parsed.payments.map((payment) => payment.client)))].map(
        (name) => ({ name, payerKey: normalizeClient(name), isCustomKey: false }),
      ),
    );
    expect(suggestions).toEqual([
      {
        payerKey: "HORWATH",
        clients: ["Horwath Consulting Zagreb", "Horwath Zagreb d.o.o."],
      },
    ]);
  });
});
