import { attachPayerKeys, normalizeClient } from "@/lib/clients/payer-keys";
import { hr } from "@/lib/i18n/hr";
import { findRemainderAllocations, isOpenAmount, openAmountFor, roundMoney } from "@/lib/matching/allocate";
import { loadPayerKeyMap } from "@/lib/services/client-keys";
import { getDb } from "@/lib/storage/db";
import { findBestMatches } from "./scorer";
import { nanoid } from "nanoid";

export async function runAutoMatch(sessionId: string, threshold = 75) {
  const db = getDb();

  const sessionInvoices = await db.invoices.where("sessionId").equals(sessionId).toArray();
  const sessionPayments = await db.payments.where("sessionId").equals(sessionId).toArray();
  const existingMatches = await db.matches
    .where("sessionId")
    .equals(sessionId)
    .filter((m) => m.active)
    .toArray();

  const payerKeyMap = await loadPayerKeyMap();
  const invoiceOpen = new Map(
    sessionInvoices.map((invoice) => [
      invoice.id,
      openAmountFor(
        invoice.total,
        existingMatches.filter((match) => match.invoiceId === invoice.id),
      ),
    ]),
  );
  const paymentOpen = new Map(
    sessionPayments.map((payment) => [
      payment.id,
      openAmountFor(
        payment.amount,
        existingMatches.filter((match) => match.paymentId === payment.id),
      ),
    ]),
  );

  const unmatchedInvoices = attachPayerKeys(
    sessionInvoices
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

  const unmatchedPayments = attachPayerKeys(
    sessionPayments
      .filter((payment) => isOpenAmount(paymentOpen.get(payment.id) ?? Math.abs(payment.amount)))
      .map((payment) => ({
        id: payment.id,
        paymentDate: payment.paymentDate,
        clientNormalized: normalizeClient(payment.client),
        amount: paymentOpen.get(payment.id) ?? Math.abs(payment.amount),
        description: payment.description,
      })),
    payerKeyMap,
  );

  const bestMatches = findBestMatches(unmatchedInvoices, unmatchedPayments, threshold);
  const usedInvoices = new Set(bestMatches.map((match) => match.invoiceId));
  const usedPayments = new Set(bestMatches.map((match) => match.paymentId));
  const remainder = findRemainderAllocations(
    unmatchedInvoices.filter((invoice) => !usedInvoices.has(invoice.id)),
    unmatchedPayments.filter((payment) => !usedPayments.has(payment.id)),
  );
  const planned = [
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
  const now = new Date();

  await db.transaction("rw", [db.matches, db.matchAudits], async () => {
    for (const match of planned) {
      const matchId = nanoid();
      await db.matches.add({
        id: matchId,
        sessionId,
        invoiceId: match.invoiceId,
        paymentId: match.paymentId,
        status: "auto",
        confidence: match.confidence,
        matchReasons: match.reasons,
        allocatedAmount: match.allocatedAmount,
        createdAt: now,
        active: true,
      });
      await db.matchAudits.add({
        id: nanoid(),
        matchId,
        sessionId,
        action: "created",
        at: now,
        meta: { type: "auto", confidence: match.confidence, allocatedAmount: match.allocatedAmount },
      });
    }
  });

  return { created: planned.length, total: planned.length };
}

export async function createManualMatch(
  sessionId: string,
  invoiceId: string,
  paymentId: string,
  status: "manual" | "overridden" = "manual",
) {
  const db = getDb();
  const now = new Date();

  const invoice = await db.invoices.get(invoiceId);
  const payment = await db.payments.get(paymentId);
  if (!invoice || invoice.sessionId !== sessionId) throw new Error(hr.api.invoiceNotFound);
  if (!payment || payment.sessionId !== sessionId) throw new Error(hr.api.paymentNotFound);

  const existing = await db.matches
    .where("sessionId")
    .equals(sessionId)
    .filter((m) => m.active && (m.invoiceId === invoiceId || m.paymentId === paymentId))
    .toArray();

  const invoiceOpen = openAmountFor(
    invoice.total,
    existing.filter((match) => match.invoiceId === invoiceId),
  );
  const paymentOpen = openAmountFor(
    Math.abs(payment.amount),
    existing.filter((match) => match.paymentId === paymentId),
  );
  if (!isOpenAmount(invoiceOpen) || !isOpenAmount(paymentOpen)) {
    throw new Error(hr.api.alreadyMatched);
  }

  const allocatedAmount = roundMoney(Math.min(invoiceOpen, paymentOpen));
  const matchId = nanoid();
  await db.matches.add({
    id: matchId,
    sessionId,
    invoiceId,
    paymentId,
    status,
    confidence: 100,
    matchReasons: [{ signal: "manual", weight: 100, score: 1, detail: hr.match.manuallyLinked }],
    allocatedAmount,
    createdAt: now,
    active: true,
  });
  await db.matchAudits.add({
    id: nanoid(),
    matchId,
    sessionId,
    action: "created",
    at: now,
    meta: { type: status },
  });

  return matchId;
}

export async function unlinkMatch(sessionId: string, matchId: string) {
  const db = getDb();
  const now = new Date();

  const match = await db.matches.get(matchId);
  if (!match || match.sessionId !== sessionId) throw new Error(hr.api.matchNotFound);

  await db.matches.update(matchId, { active: false });

  await db.matchAudits.add({
    id: nanoid(),
    matchId,
    sessionId,
    action: "unlinked",
    at: now,
    meta: { invoiceId: match.invoiceId, paymentId: match.paymentId },
  });
}

export async function unlinkAllMatches(sessionId: string, matchIds?: string[]) {
  const db = getDb();
  const now = new Date();
  const selected = matchIds ? new Set(matchIds) : null;
  if (selected && selected.size === 0) return 0;
  const active = await db.matches
    .where("sessionId")
    .equals(sessionId)
    .filter((match) => match.active && (selected === null || selected.has(match.id)))
    .toArray();

  await db.transaction("rw", [db.matches, db.matchAudits], async () => {
    for (const match of active) {
      await db.matches.update(match.id, { active: false });
      await db.matchAudits.add({
        id: nanoid(),
        matchId: match.id,
        sessionId,
        action: "unlinked",
        at: now,
        meta: { invoiceId: match.invoiceId, paymentId: match.paymentId, scope: selected ? "visible" : "all" },
      });
    }
  });

  return active.length;
}

export async function overrideMatch(
  sessionId: string,
  oldMatchId: string,
  newInvoiceId: string,
  newPaymentId: string,
) {
  const db = getDb();
  const now = new Date();

  const oldMatch = await db.matches.get(oldMatchId);
  if (!oldMatch || oldMatch.sessionId !== sessionId) throw new Error(hr.api.matchNotFound);

  await db.matches.update(oldMatchId, { active: false });

  await db.matchAudits.add({
    id: nanoid(),
    matchId: oldMatchId,
    sessionId,
    action: "overridden",
    at: now,
    meta: {
      oldInvoiceId: oldMatch.invoiceId,
      oldPaymentId: oldMatch.paymentId,
      newInvoiceId,
      newPaymentId,
    },
  });

  const otherActive = await db.matches
    .where("sessionId")
    .equals(sessionId)
    .filter(
      (m) =>
        m.active && (m.invoiceId === newInvoiceId || m.paymentId === newPaymentId),
    )
    .toArray();

  for (const m of otherActive) {
    await db.matches.update(m.id, { active: false });
    await db.matchAudits.add({
      id: nanoid(),
      matchId: m.id,
      sessionId,
      action: "unlinked",
      at: now,
      meta: { reason: "override_conflict" },
    });
  }

  const matchId = nanoid();
  await db.matches.add({
    id: matchId,
    sessionId,
    invoiceId: newInvoiceId,
    paymentId: newPaymentId,
    status: "overridden",
    confidence: 100,
    matchReasons: [
      { signal: "manual", weight: 100, score: 1, detail: hr.match.manuallyReassigned },
    ],
    createdAt: now,
    active: true,
  });
  await db.matchAudits.add({
    id: nanoid(),
    matchId,
    sessionId,
    action: "relinked",
    at: now,
    meta: { replacedMatchId: oldMatchId },
  });

  return matchId;
}
