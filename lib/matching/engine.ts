import { attachPayerKeys, normalizeClient } from "@/lib/clients/payer-keys";
import { hr } from "@/lib/i18n/hr";
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

  const matchedInvoiceIds = new Set(existingMatches.map((m) => m.invoiceId));
  const matchedPaymentIds = new Set(existingMatches.map((m) => m.paymentId));
  const payerKeyMap = await loadPayerKeyMap();

  const unmatchedInvoices = attachPayerKeys(
    sessionInvoices
      .filter((i) => !matchedInvoiceIds.has(i.id))
      .map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        invoiceDate: i.invoiceDate,
        clientNormalized: normalizeClient(i.client),
        total: i.total,
      })),
    payerKeyMap,
  );

  const unmatchedPayments = attachPayerKeys(
    sessionPayments
      .filter((p) => !matchedPaymentIds.has(p.id))
      .map((p) => ({
        id: p.id,
        paymentDate: p.paymentDate,
        clientNormalized: normalizeClient(p.client),
        amount: p.amount,
        description: p.description,
      })),
    payerKeyMap,
  );

  const bestMatches = findBestMatches(unmatchedInvoices, unmatchedPayments, threshold);
  const now = new Date();
  let created = 0;

  for (const match of bestMatches) {
    const matchId = nanoid();
    await db.matches.add({
      id: matchId,
      sessionId,
      invoiceId: match.invoiceId,
      paymentId: match.paymentId,
      status: "auto",
      confidence: match.confidence,
      matchReasons: match.reasons,
      createdAt: now,
      active: true,
    });
    await db.matchAudits.add({
      id: nanoid(),
      matchId,
      sessionId,
      action: "created",
      at: now,
      meta: { type: "auto", confidence: match.confidence },
    });
    created++;
  }

  return { created, total: bestMatches.length };
}

export async function createManualMatch(
  sessionId: string,
  invoiceId: string,
  paymentId: string,
  status: "manual" | "overridden" = "manual",
) {
  const db = getDb();
  const now = new Date();

  const existing = await db.matches
    .where("sessionId")
    .equals(sessionId)
    .filter((m) => m.active && (m.invoiceId === invoiceId || m.paymentId === paymentId))
    .toArray();

  if (existing.length > 0) {
    throw new Error(hr.api.alreadyMatched);
  }

  const matchId = nanoid();
  await db.matches.add({
    id: matchId,
    sessionId,
    invoiceId,
    paymentId,
    status,
    confidence: 100,
    matchReasons: [{ signal: "manual", weight: 100, score: 1, detail: hr.match.manuallyLinked }],
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
