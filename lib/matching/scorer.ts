import Fuse from "fuse.js";
import { differenceInDays, parseISO } from "date-fns";
import type { MatchReason } from "@/lib/types";
import { hr } from "@/lib/i18n/hr";
import { invoiceNumbersMatch } from "./invoice-number";

export type MatchCandidate = {
  invoiceId: string;
  paymentId: string;
  confidence: number;
  reasons: MatchReason[];
};

export type ScoringInvoice = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  clientNormalized: string;
  payerKey: string;
  total: number;
};

export type ScoringPayment = {
  id: string;
  paymentDate: string;
  clientNormalized: string;
  payerKey: string;
  amount: number;
  description: string;
};

const WEIGHTS = {
  amount: 40,
  invoiceNumber: 35,
  client: 20,
  date: 5,
} as const;

const AMOUNT_TOLERANCE = 0.01;
const DATE_WINDOW_DAYS = 90;
const CLIENT_FUSE_THRESHOLD = 0.15;

export function scorePair(
  invoice: ScoringInvoice,
  payment: ScoringPayment,
): MatchCandidate | null {
  const amountDiff = Math.abs(invoice.total - Math.abs(payment.amount));
  if (amountDiff > AMOUNT_TOLERANCE) return null;

  const daysApart = Math.abs(
    differenceInDays(parseISO(invoice.invoiceDate), parseISO(payment.paymentDate)),
  );
  if (daysApart > DATE_WINDOW_DAYS) return null;

  const reasons: MatchReason[] = [];
  let confidence = 0;

  const amountScore = amountDiff <= AMOUNT_TOLERANCE ? 1 : 0;
  confidence += amountScore * WEIGHTS.amount;
  reasons.push({
    signal: "amount",
    weight: WEIGHTS.amount,
    score: amountScore,
    detail:
      amountScore === 1
        ? hr.match.amountMatch(
            invoice.total.toFixed(2),
            Math.abs(payment.amount).toFixed(2),
          )
        : hr.match.amountDiff(amountDiff.toFixed(2)),
  });

  const invoiceNumMatch = invoiceNumbersMatch(invoice.invoiceNumber, payment.description);
  const invoiceNumScore = invoiceNumMatch ? 1 : 0;
  confidence += invoiceNumScore * WEIGHTS.invoiceNumber;
  reasons.push({
    signal: "invoiceNumber",
    weight: WEIGHTS.invoiceNumber,
    score: invoiceNumScore,
    detail: invoiceNumMatch
      ? hr.match.invoiceNumFound
      : hr.match.invoiceNumNotFound(payment.description),
  });

  let clientScore = 0;
  let clientDetail = "";

  if (invoice.payerKey === payment.payerKey) {
    clientScore = 1;
    clientDetail =
      invoice.clientNormalized === payment.clientNormalized
        ? hr.match.clientMatch
        : hr.match.payerKeyMatch(invoice.payerKey);
  } else if (invoice.clientNormalized === payment.clientNormalized) {
    clientScore = 1;
    clientDetail = hr.match.clientMatch;
  } else {
    const fuse = new Fuse([payment.clientNormalized], {
      threshold: CLIENT_FUSE_THRESHOLD,
      includeScore: true,
    });
    const result = fuse.search(invoice.clientNormalized);
    if (result.length > 0 && result[0].score !== undefined && result[0].score <= CLIENT_FUSE_THRESHOLD) {
      clientScore = 1 - result[0].score;
    }
    clientDetail =
      clientScore >= 0.85
        ? hr.match.clientMatch
        : hr.match.clientSimilarity((clientScore * 100).toFixed(0));
  }

  confidence += clientScore * WEIGHTS.client;
  reasons.push({
    signal: "client",
    weight: WEIGHTS.client,
    score: clientScore,
    detail: clientDetail,
  });

  const dateScore = Math.max(0, 1 - daysApart / DATE_WINDOW_DAYS);
  confidence += dateScore * WEIGHTS.date;
  reasons.push({
    signal: "date",
    weight: WEIGHTS.date,
    score: dateScore,
    detail: hr.match.daysApart(daysApart),
  });

  return {
    invoiceId: invoice.id,
    paymentId: payment.id,
    confidence: Math.round(confidence * 100) / 100,
    reasons,
  };
}

export function findBestMatches(
  invoices: ScoringInvoice[],
  payments: ScoringPayment[],
  threshold = 75,
): MatchCandidate[] {
  const candidates: MatchCandidate[] = [];

  for (const invoice of invoices) {
    for (const payment of payments) {
      const scored = scorePair(invoice, payment);
      if (scored && scored.confidence >= threshold) {
        candidates.push(scored);
      }
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence);

  const usedInvoices = new Set<string>();
  const usedPayments = new Set<string>();
  const selected: MatchCandidate[] = [];

  for (const candidate of candidates) {
    if (usedInvoices.has(candidate.invoiceId) || usedPayments.has(candidate.paymentId)) {
      continue;
    }
    usedInvoices.add(candidate.invoiceId);
    usedPayments.add(candidate.paymentId);
    selected.push(candidate);
  }

  return selected;
}

export function rankCandidatesForInvoice(
  invoice: ScoringInvoice,
  payments: ScoringPayment[],
): MatchCandidate[] {
  const results: MatchCandidate[] = [];
  for (const payment of payments) {
    const scored = scorePair(invoice, payment);
    if (scored) results.push(scored);
  }
  return results.sort((a, b) => b.confidence - a.confidence);
}

export function rankCandidatesForPayment(
  payment: ScoringPayment,
  invoices: ScoringInvoice[],
): MatchCandidate[] {
  const results: MatchCandidate[] = [];
  for (const invoice of invoices) {
    const scored = scorePair(invoice, payment);
    if (scored) results.push(scored);
  }
  return results.sort((a, b) => b.confidence - a.confidence);
}
