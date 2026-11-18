import { describe, expect, it } from "vitest";
import { findRemainderAllocations, isNearAmount, openAmountFor } from "@/lib/matching/allocate";
import { scorePair } from "@/lib/matching/scorer";
import type { ScoringInvoice, ScoringPayment } from "@/lib/matching/scorer";

function invoice(id: string, total: number, number = id): ScoringInvoice {
  return {
    id,
    invoiceNumber: number,
    invoiceDate: "2026-01-10",
    clientNormalized: "KLIJENT A",
    payerKey: "KLIJENT A",
    total,
  };
}

function payment(id: string, amount: number, description: string, date = "2026-01-20"): ScoringPayment {
  return {
    id,
    paymentDate: date,
    clientNormalized: "KLIJENT A",
    payerKey: "KLIJENT A",
    amount,
    description,
  };
}

describe("near amounts", () => {
  it("keeps a one-euro difference when the invoice number is in the description", () => {
    const result = scorePair(invoice("inv", 100, "12/2026"), payment("pay", 99.2, "Račun 12/2026"));
    expect(isNearAmount(100, 99.2)).toBe(true);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(75);
  });

  it("rejects a large amount gap from the one-to-one scorer", () => {
    const result = scorePair(invoice("inv", 100, "12/2026"), payment("pay", 40, "Račun 12/2026"));
    expect(result).toBeNull();
  });
});

describe("remainder allocations", () => {
  it("splits one payment across invoices that sum to it", () => {
    const allocations = findRemainderAllocations(
      [invoice("a", 100, "1/2026"), invoice("b", 50, "2/2026")],
      [payment("p", 150, "Uplata")],
    );
    expect(allocations.map((item) => item.invoiceId).sort()).toEqual(["a", "b"]);
    expect(allocations.reduce((sum, item) => sum + item.allocatedAmount, 0)).toBe(150);
  });

  it("allocates a smaller payment to the invoice named in the description", () => {
    const [allocation] = findRemainderAllocations(
      [invoice("a", 200, "9/2026")],
      [payment("p", 80, "Račun 9/2026")],
    );
    expect(allocation.allocatedAmount).toBe(80);
    expect(openAmountFor(200, [allocation])).toBe(120);
    expect(openAmountFor(80, [allocation])).toBe(0);
  });

  it("does not give a payment to another invoice from the same series", () => {
    const allocations = findRemainderAllocations(
      [
        invoice("wrong", 308.73, "116/RAC/25"),
        invoice("right", 308.73, "128/RAC/25"),
      ],
      [payment("pay", 668.86, "UR HORWATH br. 128/RAC/25")],
    );
    expect(allocations.map((item) => item.invoiceId)).toEqual(["right"]);
    expect(allocations[0]?.allocatedAmount).toBe(308.73);
  });

  it("treats a match without an allocated amount as fully settled", () => {
    expect(openAmountFor(100, [{ allocatedAmount: null }])).toBe(0);
  });
});
