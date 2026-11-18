import { describe, expect, it } from "vitest";
import { defaultFilters } from "@/components/filter-panel";
import { normalizeClient } from "@/lib/clients/payer-keys";
import { buildClientLedgers } from "@/lib/ledger";
import type { RecordRow } from "@/lib/types";

function invoice(
  id: string,
  client: string,
  total: number,
  invoiceDate = "2026-01-10",
  invoiceNumber = id,
): RecordRow["invoice"] {
  return {
    id,
    invoiceNumber,
    invoiceDate,
    client,
    baseAmount: total,
    vat: 0,
    total,
  };
}

function payment(
  id: string,
  client: string,
  amount: number,
  paymentDate = "2026-01-20",
  description = "Uplata",
): RecordRow["payment"] {
  return { id, paymentDate, amount, client, description };
}

function unmatchedInvoice(
  id: string,
  client: string,
  total: number,
  invoiceDate?: string,
  invoiceNumber?: string,
): RecordRow {
  return {
    matchId: null,
    matchStatus: "unmatched",
    confidence: null,
    matchReasons: null,
    invoice: invoice(id, client, total, invoiceDate, invoiceNumber),
    payment: null,
  };
}

function unmatchedPayment(
  id: string,
  client: string,
  amount: number,
  paymentDate?: string,
): RecordRow {
  return {
    matchId: null,
    matchStatus: "unmatched",
    confidence: null,
    matchReasons: null,
    invoice: null,
    payment: payment(id, client, amount, paymentDate),
  };
}

describe("buildClientLedgers", () => {
  it("totals every invoice and payment for a client and keeps a running balance", () => {
    const ledgers = buildClientLedgers(
      [
        unmatchedInvoice("inv-1", "Klijent A", 1000, "2026-01-10", "1/2026"),
        unmatchedPayment("pay-1", "Klijent A", 400, "2026-01-20"),
        unmatchedInvoice("inv-2", "Klijent A", -100, "2026-01-12", "2/2026"),
      ],
      defaultFilters,
    );

    expect(ledgers).toHaveLength(1);
    expect(ledgers[0]).toMatchObject({
      label: "Klijent A",
      invoiceCount: 2,
      paymentCount: 1,
      invoiced: 900,
      paid: 400,
      balance: 500,
    });
    expect(ledgers[0].lines.map((line) => [line.kind, line.balance])).toEqual([
      ["invoice", 1000],
      ["invoice", 900],
      ["payment", 500],
    ]);
  });

  it("splits a matched row into an invoice line and a payment line without counting twice", () => {
    const matched: RecordRow = {
      matchId: "m-1",
      matchStatus: "auto",
      confidence: 90,
      matchReasons: null,
      invoice: invoice("inv-1", "Klijent A", 1000, "2026-01-15", "1/2026"),
      payment: payment("pay-1", "Klijent A", 1000, "2026-01-15", "Račun 1/2026"),
    };

    const [ledger] = buildClientLedgers([matched, matched], defaultFilters);
    expect(ledger.invoiceCount).toBe(1);
    expect(ledger.paymentCount).toBe(1);
    expect(ledger.balance).toBe(0);
    expect(ledger.lines.map((line) => line.kind)).toEqual(["invoice", "payment"]);
  });

  it("puts aliases that share a payer key on one card", () => {
    const map = new Map<string, string>([
      [normalizeClient("HW Zagreb"), "HORWATH"],
      [normalizeClient("Horwath Hrvatska"), "HORWATH"],
    ]);

    const ledgers = buildClientLedgers(
      [
        unmatchedInvoice("inv-1", "HW Zagreb", 800),
        unmatchedPayment("pay-1", "Horwath Hrvatska", 300),
        unmatchedInvoice("inv-2", "Drugi klijent", 50),
      ],
      defaultFilters,
      map,
    );

    expect(ledgers).toHaveLength(2);
    const ledger = ledgers.find((item) => item.label === "HORWATH");
    if (!ledger) throw new Error("expected HORWATH ledger");
    expect(ledger.label).toBe("HORWATH");
    expect(ledger.clients).toEqual(["Horwath Hrvatska", "HW Zagreb"]);
    expect(ledger.invoiced).toBe(800);
    expect(ledger.paid).toBe(300);
    expect(ledger.balance).toBe(500);
  });

  it("uses the absolute payment amount", () => {
    const [ledger] = buildClientLedgers(
      [unmatchedInvoice("inv-1", "Klijent A", 200), unmatchedPayment("pay-1", "Klijent A", -80)],
      defaultFilters,
    );
    expect(ledger.paid).toBe(80);
    expect(ledger.balance).toBe(120);
  });

  it("filters each document by its own date and ignores match status", () => {
    const ledgers = buildClientLedgers(
      [
        unmatchedInvoice("inv-1", "Klijent A", 1000, "2026-01-10"),
        unmatchedPayment("pay-1", "Klijent A", 400, "2026-02-02"),
      ],
      { ...defaultFilters, dateFrom: "2026-01-01", dateTo: "2026-01-31", status: "auto" },
    );

    expect(ledgers[0].invoiceCount).toBe(1);
    expect(ledgers[0].paymentCount).toBe(0);
    expect(ledgers[0].balance).toBe(1000);
  });

  it("keeps a client when search matches an invoice number on that card", () => {
    const ledgers = buildClientLedgers(
      [
        unmatchedInvoice("inv-1", "Klijent A", 1000, "2026-01-10", "12/2026"),
        unmatchedInvoice("inv-2", "Klijent B", 20, "2026-01-10", "99/2026"),
      ],
      { ...defaultFilters, search: "12/2026" },
    );

    expect(ledgers).toHaveLength(1);
    expect(ledgers[0].label).toBe("Klijent A");
    expect(ledgers[0].lines).toHaveLength(1);
  });
});
