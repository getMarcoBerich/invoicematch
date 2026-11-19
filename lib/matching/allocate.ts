import { differenceInDays, parseISO } from "date-fns";
import type { MatchReason } from "@/lib/types";
import { hr } from "@/lib/i18n/hr";
import { invoiceNumbersMatch } from "./invoice-number";
import type { ScoringInvoice, ScoringPayment } from "./scorer";

export const OPEN_TOLERANCE = 0.01;

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function nearAmountLimit(invoiceTotal: number, paymentAmount: number): number {
  const base = Math.max(Math.abs(invoiceTotal), Math.abs(paymentAmount), 1);
  return Math.max(1, base * 0.005);
}

export function isNearAmount(invoiceTotal: number, paymentAmount: number): boolean {
  const gap = Math.abs(invoiceTotal - Math.abs(paymentAmount));
  return gap <= OPEN_TOLERANCE || gap <= nearAmountLimit(invoiceTotal, paymentAmount);
}

export type AllocationMatch = {
  invoiceId: string;
  paymentId: string;
  allocatedAmount: number;
  confidence: number;
  reasons: MatchReason[];
};

type SideMatch = { allocatedAmount?: number | null };

export function openAmountFor(documentTotal: number, matches: SideMatch[]): number {
  if (matches.length === 0) return roundMoney(Math.abs(documentTotal));
  if (matches.some((match) => match.allocatedAmount == null)) return 0;
  const used = matches.reduce((sum, match) => sum + (match.allocatedAmount ?? 0), 0);
  return roundMoney(Math.max(0, Math.abs(documentTotal) - used));
}

export function isOpenAmount(amount: number): boolean {
  return amount > OPEN_TOLERANCE;
}

function samePayer(invoice: ScoringInvoice, payment: ScoringPayment): boolean {
  return invoice.payerKey === payment.payerKey || invoice.clientNormalized === payment.clientNormalized;
}

function withinDays(invoice: ScoringInvoice, payment: ScoringPayment, days: number): boolean {
  return (
    Math.abs(differenceInDays(parseISO(invoice.invoiceDate), parseISO(payment.paymentDate))) <= days
  );
}

function sumClose(total: number, target: number): boolean {
  return Math.abs(total - target) <= Math.max(0.05, Math.abs(target) * 0.005);
}

function mentionedInvoices(payment: ScoringPayment, invoices: ScoringInvoice[]): ScoringInvoice[] {
  return invoices.filter((invoice) => invoiceNumbersMatch(invoice.invoiceNumber, payment.description));
}

function combinationSums(
  invoices: ScoringInvoice[],
  target: number,
): ScoringInvoice[] | null {
  const pool = invoices.slice(0, Math.min(invoices.length, 8));
  let best: { items: ScoringInvoice[]; gap: number } | null = null;

  for (let i = 0; i < pool.length; i++) {
    const first = pool[i];
    for (let j = i + 1; j < pool.length; j++) {
      const second = pool[j];
      const sum2 = roundMoney(first.total + second.total);
      best = preferCombination(best, [first, second], sum2, target);
      if (sum2 > target + Math.max(0.05, target * 0.005)) continue;
      for (let k = j + 1; k < pool.length; k++) {
        const third = pool[k];
        const sum3 = roundMoney(sum2 + third.total);
        best = preferCombination(best, [first, second, third], sum3, target);
        if (sum3 > target + Math.max(0.05, target * 0.005)) continue;
        for (let n = k + 1; n < pool.length; n++) {
          const fourth = pool[n];
          best = preferCombination(
            best,
            [first, second, third, fourth],
            roundMoney(sum3 + fourth.total),
            target,
          );
        }
      }
    }
  }

  return best?.items ?? null;
}

function preferCombination(
  current: { items: ScoringInvoice[]; gap: number } | null,
  items: ScoringInvoice[],
  sum: number,
  target: number,
): { items: ScoringInvoice[]; gap: number } | null {
  if (items.length < 2 || !sumClose(sum, target)) return current;
  const gap = Math.abs(sum - target);
  if (
    current === null ||
    gap < current.gap - 0.001 ||
    (Math.abs(gap - current.gap) <= 0.001 && items.length < current.items.length)
  ) {
    return { items: [...items], gap };
  }
  return current;
}

function reasonsFor(
  payment: ScoringPayment,
  invoices: ScoringInvoice[],
  allocated: number,
  kind: "split" | "partial",
): MatchReason[] {
  const numbers = invoices.map((invoice) => invoice.invoiceNumber).join(", ");
  const amountDetail =
    kind === "split"
      ? hr.match.splitPayment(numbers, allocated.toFixed(2))
      : hr.match.partialPayment(numbers, allocated.toFixed(2));
  const numberHit = invoices.some((invoice) =>
    invoiceNumbersMatch(invoice.invoiceNumber, payment.description),
  );
  const clientsMatch = invoices.every((invoice) => samePayer(invoice, payment));
  const sameName = invoices.every((invoice) => invoice.clientNormalized === payment.clientNormalized);
  return [
    {
      signal: "amount",
      weight: 55,
      score: kind === "split" ? 1 : 0.7,
      detail: amountDetail,
    },
    {
      signal: "invoiceNumber",
      weight: 20,
      score: numberHit ? 1 : 0,
      detail: numberHit ? hr.match.invoiceNumFound : hr.match.invoiceNumNotFound(payment.description),
    },
    {
      signal: "client",
      weight: 20,
      score: clientsMatch ? 1 : 0,
      detail: !clientsMatch
        ? hr.match.clientMismatch
        : sameName
          ? hr.match.clientMatch
          : hr.match.payerKeyMatch(invoices[0]?.payerKey ?? payment.payerKey),
    },
  ];
}

export function findRemainderAllocations(
  invoices: ScoringInvoice[],
  payments: ScoringPayment[],
): AllocationMatch[] {
  const usedInvoices = new Set<string>();
  const allocations: AllocationMatch[] = [];

  const sortedPayments = [...payments].sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));

  for (const payment of sortedPayments) {
    const pool = invoices.filter(
      (invoice) =>
        !usedInvoices.has(invoice.id) &&
        invoice.total > OPEN_TOLERANCE &&
        withinDays(invoice, payment, 180) &&
        (samePayer(invoice, payment) || invoiceNumbersMatch(invoice.invoiceNumber, payment.description)),
    );
    if (pool.length === 0) continue;

    const paymentAmount = roundMoney(Math.abs(payment.amount));
    const mentioned = mentionedInvoices(payment, pool);
    let chosen: ScoringInvoice[] | null = null;

    if (mentioned.length >= 2 && sumClose(mentioned.reduce((sum, invoice) => sum + invoice.total, 0), paymentAmount)) {
      chosen = mentioned;
    } else {
      const samePayerPool = pool
        .filter((invoice) => samePayer(invoice, payment))
        .sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate));
      chosen = combinationSums(samePayerPool, paymentAmount);
    }

    if (chosen && chosen.length >= 2) {
      const confidence = chosen.every((invoice) =>
        invoiceNumbersMatch(invoice.invoiceNumber, payment.description),
      )
        ? 92
        : 80;
      for (const invoice of chosen) {
        const allocated = roundMoney(invoice.total);
        allocations.push({
          invoiceId: invoice.id,
          paymentId: payment.id,
          allocatedAmount: allocated,
          confidence,
          reasons: reasonsFor(payment, [invoice], allocated, "split"),
        });
        usedInvoices.add(invoice.id);
      }
      continue;
    }

    if (mentioned.length === 1) {
      const invoice = mentioned[0];
      const allocated = roundMoney(Math.min(invoice.total, paymentAmount));
      if (allocated <= OPEN_TOLERANCE) continue;
      const kind = allocated + OPEN_TOLERANCE < invoice.total ? "partial" : "split";
      allocations.push({
        invoiceId: invoice.id,
        paymentId: payment.id,
        allocatedAmount: allocated,
        confidence: kind === "partial" ? 88 : 90,
        reasons: reasonsFor(payment, [invoice], allocated, kind === "partial" ? "partial" : "split"),
      });
      usedInvoices.add(invoice.id);
    }
  }

  return allocations;
}
