import { scorePair, type ScoringInvoice, type ScoringPayment } from "@/lib/matching/scorer";
import type { RecordRow } from "@/lib/types";
import { normalizeClient, resolvePayerKey, type PayerKeyMap } from "@/lib/clients/payer-keys";
import { isRefundPayment, OPEN_TOLERANCE } from "@/lib/matching/allocate";

const CLOSE_CALL_MIN = 60;
const CLOSE_CALL_LIMIT = 40;
const DATE_MATCH_DAYS = 7;

function calendarDaysApart(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00`);
  const end = Date.parse(`${to}T00:00:00`);
  if (Number.isNaN(start) || Number.isNaN(end)) return Number.POSITIVE_INFINITY;
  return Math.abs(Math.round((end - start) / 86400000));
}

function matchedSignals(
  reasons: { signal: string; score: number; weight: number }[],
  invoiceDate: string,
  paymentDate: string,
): CloseCallSignal[] {
  const signals: CloseCallSignal[] = [];
  const amount = pointsFor(reasons, "amount");
  if (amount >= 54.99) signals.push("amount");
  else if (amount > 0) signals.push("nearAmount");
  if (pointsFor(reasons, "invoiceNumber") > 0) signals.push("invoiceNumber");
  if (pointsFor(reasons, "client") > 0) signals.push("client");
  if (calendarDaysApart(invoiceDate, paymentDate) <= DATE_MATCH_DAYS) signals.push("date");
  return signals;
}

export type CloseCallSignal = "amount" | "nearAmount" | "invoiceNumber" | "client" | "date";

export type CloseCall = {
  confidence: number;
  invoiceId: string;
  paymentId: string;
  invoiceNumber: string;
  invoiceClient: string;
  invoiceDate: string;
  paymentClient: string;
  paymentDate: string;
  description: string;
  amount: number;
  paymentAmount: number;
  matches: CloseCallSignal[];
};

export type CloseCallInvoice = ScoringInvoice & {
  client: string;
};

export type CloseCallPayment = ScoringPayment & {
  client: string;
};

function pointsFor(reasons: { signal: string; score: number; weight: number }[], signal: string) {
  const reason = reasons.find((item) => item.signal === signal);
  if (!reason) return 0;
  return Math.round(reason.score * reason.weight * 100) / 100;
}

/** Open pairs from 60 up to the automatic-match threshold. */
export function findCloseCalls(
  invoices: CloseCallInvoice[],
  payments: CloseCallPayment[],
): CloseCall[] {
  const rows: CloseCall[] = [];
  for (const invoice of invoices) {
    for (const payment of payments) {
      const scored = scorePair(invoice, payment);
      if (!scored || scored.confidence < CLOSE_CALL_MIN || scored.confidence >= 75) continue;
      rows.push({
        confidence: scored.confidence,
        invoiceId: invoice.id,
        paymentId: payment.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceClient: invoice.client,
        invoiceDate: invoice.invoiceDate,
        paymentClient: payment.client,
        paymentDate: payment.paymentDate,
        description: payment.description,
        amount: invoice.total,
        paymentAmount: payment.amount,
        matches: matchedSignals(scored.reasons, invoice.invoiceDate, payment.paymentDate),
      });
    }
  }
  return rows.sort((a, b) => b.confidence - a.confidence).slice(0, CLOSE_CALL_LIMIT);
}

export function closeCallsFromRecords(records: RecordRow[], payerKeyMap: PayerKeyMap): CloseCall[] {
  const invoices = new Map<string, CloseCallInvoice>();
  const payments = new Map<string, CloseCallPayment>();

  for (const record of records) {
    const invoice = record.invoice;
    if (invoice) {
      const open = invoice.openAmount ?? (record.payment ? 0 : invoice.total);
      if (open > OPEN_TOLERANCE && !invoices.has(invoice.id)) {
        const clientNormalized = normalizeClient(invoice.client);
        invoices.set(invoice.id, {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate,
          client: invoice.client,
          clientNormalized,
          payerKey: resolvePayerKey(clientNormalized, payerKeyMap),
          total: open,
        });
      }
    }

    const payment = record.payment;
    if (payment && !isRefundPayment(payment.amount)) {
      const open = payment.openAmount ?? (record.invoice ? 0 : Math.abs(payment.amount));
      if (open > OPEN_TOLERANCE && !payments.has(payment.id)) {
        const clientNormalized = normalizeClient(payment.client);
        payments.set(payment.id, {
          id: payment.id,
          paymentDate: payment.paymentDate,
          client: payment.client,
          clientNormalized,
          payerKey: resolvePayerKey(clientNormalized, payerKeyMap),
          amount: open,
          description: payment.description,
        });
      }
    }
  }

  return findCloseCalls([...invoices.values()], [...payments.values()]);
}
