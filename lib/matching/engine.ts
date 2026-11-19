import { hr } from "@/lib/i18n/hr";
import { isOpenAmount, openAmountFor, roundMoney } from "@/lib/matching/allocate";
import { buildAutoMatchPlan, type AutoMatchPlan } from "@/lib/matching/plan";
import { loadPayerKeyMap } from "@/lib/services/client-keys";
import { getDb } from "@/lib/storage/db";
import { nanoid } from "nanoid";

export type { AutoMatchPlan } from "@/lib/matching/plan";

export async function planAutoMatch(sessionId: string, threshold = 75): Promise<AutoMatchPlan> {
  const db = getDb();
  const [sessionInvoices, sessionPayments, existingMatches, payerKeyMap] = await Promise.all([
    db.invoices.where("sessionId").equals(sessionId).toArray(),
    db.payments.where("sessionId").equals(sessionId).toArray(),
    db.matches.where("sessionId").equals(sessionId).filter((match) => match.active).toArray(),
    loadPayerKeyMap(),
  ]);
  return buildAutoMatchPlan(sessionInvoices, sessionPayments, existingMatches, payerKeyMap, threshold);
}

export async function applyAutoMatchPlan(sessionId: string, plan: AutoMatchPlan) {
  const db = getDb();
  const now = new Date();

  await db.transaction("rw", [db.matches, db.matchAudits], async () => {
    for (const removal of plan.toRemove) {
      await db.matches.update(removal.matchId, { active: false });
      await db.matchAudits.add({
        id: nanoid(),
        matchId: removal.matchId,
        sessionId,
        action: "unlinked",
        at: now,
        meta: {
          invoiceId: removal.invoiceId,
          paymentId: removal.paymentId,
          scope: "auto-review",
        },
      });
    }
    for (const match of plan.toAdd) {
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

  return { created: plan.toAdd.length, removed: plan.toRemove.length, total: plan.toAdd.length };
}

export async function runAutoMatch(sessionId: string, threshold = 75) {
  const plan = await planAutoMatch(sessionId, threshold);
  return applyAutoMatchPlan(sessionId, plan);
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
