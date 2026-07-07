import { describe, expect, it } from "vitest";
import { defaultFilters } from "@/components/filter-panel";
import { filterRecords } from "@/lib/filters";
import type { RecordRow } from "@/lib/types";

const unmatchedPayment: RecordRow = {
  matchId: null,
  matchStatus: "unmatched",
  confidence: null,
  matchReasons: null,
  invoice: null,
  payment: {
    id: "pay-1",
    paymentDate: "2026-01-20",
    amount: 500,
    client: "Klijent 2",
    description: "Uplata",
  },
};

const unmatchedInvoice: RecordRow = {
  matchId: null,
  matchStatus: "unmatched",
  confidence: null,
  matchReasons: null,
  invoice: {
    id: "inv-1",
    invoiceNumber: "1/2026",
    invoiceDate: "2026-01-15",
    client: "Klijent 1",
    baseAmount: 0,
    vat: 0,
    total: 1000,
  },
  payment: null,
};

describe("filterRecords date filter", () => {
  it("keeps unmatched payments on All tab when filtering by invoice date", () => {
    const filters = {
      ...defaultFilters,
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      dateField: "invoice" as const,
    };

    const result = filterRecords([unmatchedPayment], filters, "all");
    expect(result).toHaveLength(1);
  });

  it("filters matched rows by selected date field on All tab", () => {
    const matched: RecordRow = {
      matchId: "m-1",
      matchStatus: "auto",
      confidence: 90,
      matchReasons: null,
      invoice: {
        id: "inv-2",
        invoiceNumber: "2/2026",
        invoiceDate: "2026-02-01",
        client: "Klijent 1",
        baseAmount: 0,
        vat: 0,
        total: 1000,
      },
      payment: {
        id: "pay-2",
        paymentDate: "2026-01-10",
        amount: 1000,
        client: "Klijent 1",
        description: "Uplata",
      },
    };

    const filters = {
      ...defaultFilters,
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      dateField: "invoice" as const,
    };

    const result = filterRecords([matched], filters, "all");
    expect(result).toHaveLength(0);
  });

  it("filters unmatched invoices by invoice date on unmatched-invoices tab", () => {
    const filters = {
      ...defaultFilters,
      dateFrom: "2026-02-01",
      dateTo: "2026-02-28",
      dateField: "payment" as const,
    };

    const result = filterRecords([unmatchedInvoice], filters, "unmatched-invoices");
    expect(result).toHaveLength(0);
  });
});
