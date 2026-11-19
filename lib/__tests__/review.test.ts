import { describe, expect, it } from "vitest";
import { descriptionMentionsClient } from "@/lib/clients/payer-keys";
import { defaultFilters } from "@/components/filter-panel";
import { buildClientLedgers, buildOpenItems } from "@/lib/ledger";
import { findCloseCalls } from "@/lib/matching/close-calls";
import { buildAutoMatchPlan } from "@/lib/matching/plan";
import type { RecordRow } from "@/lib/types";

function invoice(id: string, client: string, total: number, invoiceDate = "2026-10-01") {
  return { id, invoiceNumber: id, invoiceDate, client, total };
}

function payment(
  id: string,
  client: string,
  amount: number,
  paymentDate = "2026-10-02",
  description = "",
) {
  return { id, paymentDate, amount, client, description };
}

describe("buildAutoMatchPlan", () => {
  it("does not auto-match a refund and drops an existing automatic refund match", () => {
    const plan = buildAutoMatchPlan(
      [invoice("inv", "Sara Oda", 400)],
      [payment("pay", "Sara Oda", -400, "2026-10-21", "Povrat")],
      [
        {
          id: "m-refund",
          invoiceId: "inv",
          paymentId: "pay",
          status: "auto",
          allocatedAmount: 400,
          active: true,
        },
      ],
    );

    expect(plan.toAdd).toEqual([]);
    expect(plan.toRemove.map((item) => item.matchId)).toEqual(["m-refund"]);
  });

  it("adds a fresh pair and leaves a manual match in place", () => {
    const added = buildAutoMatchPlan(
      [invoice("inv", "Alfa d.o.o.", 100)],
      [payment("pay", "ALFA D.O.O.", 100, "2026-10-03", "Uplata")],
      [],
    );
    expect(added.toAdd).toHaveLength(1);
    expect(added.toRemove).toEqual([]);
    expect(added.toAdd[0].confidence).toBeGreaterThanOrEqual(75);

    const kept = buildAutoMatchPlan(
      [invoice("inv", "Alfa d.o.o.", 100)],
      [payment("pay", "ALFA D.O.O.", 100)],
      [
        {
          id: "m-manual",
          invoiceId: "inv",
          paymentId: "pay",
          status: "manual",
          allocatedAmount: 100,
          active: true,
        },
      ],
    );
    expect(kept.toAdd).toEqual([]);
    expect(kept.toRemove).toEqual([]);
  });

  it("does not churn an automatic match that still clears the threshold", () => {
    const plan = buildAutoMatchPlan(
      [invoice("inv", "Alfa d.o.o.", 100)],
      [payment("pay", "ALFA D.O.O.", 100)],
      [
        {
          id: "m-auto",
          invoiceId: "inv",
          paymentId: "pay",
          status: "auto",
          allocatedAmount: 100,
          active: true,
        },
      ],
    );
    expect(plan.toAdd).toEqual([]);
    expect(plan.toRemove).toEqual([]);
  });
});

describe("findCloseCalls", () => {
  it("keeps a near amount for the same client", () => {
    const calls = findCloseCalls(
      [
        {
          id: "near",
          invoiceNumber: "1/2026",
          invoiceDate: "2026-10-01",
          client: "Alfa d.o.o.",
          clientNormalized: "ALFA D.O.O.",
          payerKey: "ALFA D.O.O.",
          total: 100,
        },
        {
          id: "other",
          invoiceNumber: "2/2026",
          invoiceDate: "2026-10-01",
          client: "Alfa d.o.o.",
          clientNormalized: "ALFA D.O.O.",
          payerKey: "ALFA D.O.O.",
          total: 250,
        },
      ],
      [
        {
          id: "near-pay",
          paymentDate: "2026-10-02",
          client: "ALFA D.O.O.",
          clientNormalized: "ALFA D.O.O.",
          payerKey: "ALFA D.O.O.",
          amount: 99,
          description: "Uplata",
        },
        {
          id: "other-pay",
          paymentDate: "2026-10-02",
          client: "Beta servis d.o.o.",
          clientNormalized: "BETA SERVIS D.O.O.",
          payerKey: "BETA SERVIS D.O.O.",
          amount: 250,
          description: "Druga uplata",
        },
      ],
    );

    expect(calls.map((call) => call.invoiceId)).toEqual(["near"]);
    expect(calls[0].confidence).toBeGreaterThanOrEqual(60);
    expect(calls[0].confidence).toBeLessThan(75);
    expect(calls[0].matches).toEqual(expect.arrayContaining(["nearAmount", "client", "date"]));
  });
});

describe("descriptionMentionsClient", () => {
  it("notices the invoice client named in a payment description", () => {
    expect(
      descriptionMentionsClient("Valentina Bagarić", "VW Taigo - kupac Valentina Bagarić"),
    ).toBe(true);
    expect(descriptionMentionsClient("Josip Bagarić", "VW Taigo - kupac Valentina Bagarić")).toBe(
      false,
    );
  });
});

describe("buildOpenItems", () => {
  it("lists unpaid invoices oldest first", () => {
    const older: RecordRow = {
      matchId: null,
      matchStatus: "unmatched",
      confidence: null,
      matchReasons: null,
      invoice: {
        id: "old",
        invoiceNumber: "1/2025",
        invoiceDate: "2025-01-01",
        client: "Alfa d.o.o.",
        baseAmount: 80,
        vat: 0,
        total: 80,
        openAmount: 80,
      },
      payment: null,
    };
    const newer: RecordRow = {
      ...older,
      invoice: {
        ...older.invoice!,
        id: "new",
        invoiceNumber: "2/2026",
        invoiceDate: "2026-10-01",
        total: 40,
        openAmount: 40,
      },
    };
    const items = buildOpenItems(buildClientLedgers([newer, older], defaultFilters, new Map(), "2026-11-19"));
    expect(items.map((item) => item.document)).toEqual(["1/2025", "2/2026"]);
    expect(items[0].daysOpen).toBeGreaterThan(items[1].daysOpen);
  });
});
