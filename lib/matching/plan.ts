import { attachPayerKeys, normalizeClient } from "@/lib/clients/payer-keys";
import {
  findRemainderAllocations,
  isOpenAmount,
  isRefundPayment,
  openAmountFor,
  roundMoney,
} from "@/lib/matching/allocate";
import { findBestMatches } from "@/lib/matching/scorer";
import type { MatchReason } from "@/lib/types";
import type { PayerKeyMap } from "@/lib/clients/payer-keys";

export type PlanInvoice = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  client: string;
  total: number;
};

export type PlanPayment = {
  id: string;
  paymentDate: string;
  amount: number;
  client: string;
  description: string;
};

export type PlanMatch = {
  id: string;
  invoiceId: string;
  paymentId: string;
  status: "auto" | "manual" | "overridden";
  allocatedAmount?: number | null;
  active: boolean;
};

export type PlannedAddition = {
  invoiceId: string;
  paymentId: string;
  invoiceNumber: string;
  invoiceClient: string;
  invoiceDate: string;
  paymentClient: string;
  paymentDate: string;
  description: string;
  amount: number;
  confidence: number;
  reasons: MatchReason[];
  allocatedAmount: number;
};

export type PlannedRemoval = {
  matchId: string;
  invoiceId: string;
  paymentId: string;
  invoiceNumber: string;
  invoiceClient: string;
  paymentClient: string;
  paymentDate: string;
  description: string;
  amount: number;
};

export type AutoMatchPlan = {
  toAdd: PlannedAddition[];
  toRemove: PlannedRemoval[];
};

function pairKey(invoiceId: string, paymentId: string) {
  return `${invoiceId}:${paymentId}`;
}

export function buildAutoMatchPlan(
  invoices: PlanInvoice[],
  payments: PlanPayment[],
  existingMatches: PlanMatch[],
  payerKeyMap: PayerKeyMap = new Map(),
  threshold = 75,
): AutoMatchPlan {
  const active = existingMatches.filter((match) => match.active);
  const kept = active.filter((match) => match.status !== "auto");
  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));

  const invoiceOpen = new Map(
    invoices.map((invoice) => [
      invoice.id,
      openAmountFor(
        invoice.total,
        kept.filter((match) => match.invoiceId === invoice.id),
      ),
    ]),
  );
  const paymentOpen = new Map(
    payments.map((payment) => [
      payment.id,
      openAmountFor(
        payment.amount,
        kept.filter((match) => match.paymentId === payment.id),
      ),
    ]),
  );

  const openInvoices = attachPayerKeys(
    invoices
      .filter((invoice) => isOpenAmount(invoiceOpen.get(invoice.id) ?? invoice.total))
      .map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        clientNormalized: normalizeClient(invoice.client),
        total: invoiceOpen.get(invoice.id) ?? invoice.total,
      })),
    payerKeyMap,
  );
  const openPayments = attachPayerKeys(
    payments
      .filter((payment) => !isRefundPayment(payment.amount))
      .filter((payment) => isOpenAmount(paymentOpen.get(payment.id) ?? payment.amount))
      .map((payment) => ({
        id: payment.id,
        paymentDate: payment.paymentDate,
        clientNormalized: normalizeClient(payment.client),
        amount: paymentOpen.get(payment.id) ?? payment.amount,
        description: payment.description,
      })),
    payerKeyMap,
  );

  const bestMatches = findBestMatches(openInvoices, openPayments, threshold);
  const usedInvoices = new Set(bestMatches.map((match) => match.invoiceId));
  const usedPayments = new Set(bestMatches.map((match) => match.paymentId));
  const remainder = findRemainderAllocations(
    openInvoices.filter((invoice) => !usedInvoices.has(invoice.id)),
    openPayments.filter((payment) => !usedPayments.has(payment.id)),
  );
  const proposed = [
    ...bestMatches.map((match) => ({
      invoiceId: match.invoiceId,
      paymentId: match.paymentId,
      confidence: match.confidence,
      reasons: match.reasons,
      allocatedAmount: roundMoney(
        Math.min(invoiceOpen.get(match.invoiceId) ?? 0, paymentOpen.get(match.paymentId) ?? 0),
      ),
    })),
    ...remainder,
  ];

  const proposedKeys = new Set(proposed.map((match) => pairKey(match.invoiceId, match.paymentId)));
  const autoMatches = active.filter((match) => match.status === "auto");
  const autoKeys = new Set(autoMatches.map((match) => pairKey(match.invoiceId, match.paymentId)));

  const describe = (invoiceId: string, paymentId: string, amount: number) => {
    const invoice = invoiceById.get(invoiceId);
    const payment = paymentById.get(paymentId);
    return {
      invoiceId,
      paymentId,
      invoiceNumber: invoice?.invoiceNumber ?? "",
      invoiceClient: invoice?.client ?? "",
      invoiceDate: invoice?.invoiceDate ?? "",
      paymentClient: payment?.client ?? "",
      paymentDate: payment?.paymentDate ?? "",
      description: payment?.description ?? "",
      amount,
    };
  };

  return {
    toAdd: proposed
      .filter((match) => !autoKeys.has(pairKey(match.invoiceId, match.paymentId)))
      .map((match) => ({
        ...describe(match.invoiceId, match.paymentId, match.allocatedAmount),
        confidence: match.confidence,
        reasons: match.reasons,
        allocatedAmount: match.allocatedAmount,
      })),
    toRemove: autoMatches
      .filter((match) => !proposedKeys.has(pairKey(match.invoiceId, match.paymentId)))
      .map((match) => ({
        matchId: match.id,
        ...describe(
          match.invoiceId,
          match.paymentId,
          match.allocatedAmount ?? Math.abs(paymentById.get(match.paymentId)?.amount ?? 0),
        ),
      })),
  };
}
