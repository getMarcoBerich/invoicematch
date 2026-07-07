import { parseExcelBuffer } from "@/lib/excel/parser";
import { hr } from "@/lib/i18n/hr";
import { defaultSessionName, getSessionDisplayName } from "@/lib/session-name";
import { deleteAllPayerKeys } from "@/lib/services/client-keys";
import { getDb } from "@/lib/storage/db";
import type { RecordRow } from "@/lib/types";
import { nanoid } from "nanoid";

export type { RecordRow };
export { getSessionDisplayName };

export async function renameSession(sessionId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error(hr.api.sessionNameRequired);

  const db = getDb();
  const session = await db.importSessions.get(sessionId);
  if (!session) throw new Error(hr.api.sessionNotFound);

  await db.importSessions.update(sessionId, { name: trimmed });
  return trimmed;
}

export async function importExcelFile(filename: string, buffer: ArrayBuffer) {
  const parsed = await parseExcelBuffer(buffer);

  if (parsed.invoices.length === 0 && parsed.payments.length === 0) {
    throw new Error(hr.api.importEmpty);
  }

  const db = getDb();
  const sessionId = nanoid();
  const now = new Date();
  const name = defaultSessionName(filename);

  const invoiceRows = parsed.invoices.map((inv) => ({
    id: nanoid(),
    sessionId,
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate,
    client: inv.client,
    baseAmount: inv.baseAmount,
    vat: inv.vat,
    total: inv.total,
    rowHash: inv.rowHash,
  }));

  const paymentRows = parsed.payments.map((pay) => ({
    id: nanoid(),
    sessionId,
    paymentDate: pay.paymentDate,
    amount: pay.amount,
    client: pay.client,
    description: pay.description,
    rowHash: pay.rowHash,
  }));

  await db.transaction("rw", [db.importSessions, db.invoices, db.payments], async () => {
    await db.importSessions.add({
      id: sessionId,
      filename,
      name,
      importedAt: now,
    });
    if (invoiceRows.length > 0) await db.invoices.bulkAdd(invoiceRows);
    if (paymentRows.length > 0) await db.payments.bulkAdd(paymentRows);
  });

  return {
    sessionId,
    filename,
    name,
    sheetName: parsed.sheetName,
    invoiceCount: parsed.invoices.length,
    paymentCount: parsed.payments.length,
    warnings: parsed.warnings,
  };
}

export async function getSessionRecords(sessionId: string): Promise<{
  session: { id: string; filename: string; name: string; importedAt: Date };
  records: RecordRow[];
  stats: {
    totalInvoices: number;
    totalPayments: number;
    totalInvoiceAmount: number;
    totalPaymentAmount: number;
    matched: number;
    unmatchedInvoices: number;
    unmatchedPayments: number;
  };
}> {
  const db = getDb();

  const session = await db.importSessions.get(sessionId);
  if (!session) throw new Error(hr.api.sessionNotFound);

  const sessionInvoices = await db.invoices.where("sessionId").equals(sessionId).toArray();
  const sessionPayments = await db.payments.where("sessionId").equals(sessionId).toArray();
  const activeMatches = await db.matches
    .where("sessionId")
    .equals(sessionId)
    .filter((m) => m.active)
    .toArray();

  const invoiceMap = new Map(sessionInvoices.map((i) => [i.id, i]));
  const paymentMap = new Map(sessionPayments.map((p) => [p.id, p]));
  const matchedInvoiceIds = new Set(activeMatches.map((m) => m.invoiceId));
  const matchedPaymentIds = new Set(activeMatches.map((m) => m.paymentId));
  const records: RecordRow[] = [];

  const toInvoice = (inv: (typeof sessionInvoices)[0]) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate,
    client: inv.client,
    baseAmount: inv.baseAmount,
    vat: inv.vat,
    total: inv.total,
  });

  const toPayment = (pay: (typeof sessionPayments)[0]) => ({
    id: pay.id,
    paymentDate: pay.paymentDate,
    amount: pay.amount,
    client: pay.client,
    description: pay.description,
  });

  for (const match of activeMatches) {
    const inv = invoiceMap.get(match.invoiceId);
    const pay = paymentMap.get(match.paymentId);
    records.push({
      matchId: match.id,
      matchStatus: match.status,
      confidence: match.confidence,
      matchReasons: match.matchReasons,
      invoice: inv ? toInvoice(inv) : null,
      payment: pay ? toPayment(pay) : null,
    });
  }

  for (const inv of sessionInvoices) {
    if (matchedInvoiceIds.has(inv.id)) continue;
    records.push({
      matchId: null,
      matchStatus: "unmatched",
      confidence: null,
      matchReasons: null,
      invoice: toInvoice(inv),
      payment: null,
    });
  }

  for (const pay of sessionPayments) {
    if (matchedPaymentIds.has(pay.id)) continue;
    records.push({
      matchId: null,
      matchStatus: "unmatched",
      confidence: null,
      matchReasons: null,
      invoice: null,
      payment: toPayment(pay),
    });
  }

  const matched = activeMatches.length;

  return {
    session: {
      id: session.id,
      filename: session.filename,
      name: session.name,
      importedAt: session.importedAt,
    },
    records,
    stats: {
      totalInvoices: sessionInvoices.length,
      totalPayments: sessionPayments.length,
      totalInvoiceAmount: sessionInvoices.reduce((sum, inv) => sum + inv.total, 0),
      totalPaymentAmount: sessionPayments.reduce((sum, pay) => sum + Math.abs(pay.amount), 0),
      matched,
      unmatchedInvoices: sessionInvoices.filter((i) => !matchedInvoiceIds.has(i.id)).length,
      unmatchedPayments: sessionPayments.filter((p) => !matchedPaymentIds.has(p.id)).length,
    },
  };
}

export async function listSessionSummaries(limit = 30) {
  const db = getDb();
  const sessions = await db.importSessions.orderBy("importedAt").reverse().limit(limit).toArray();

  const summaries = await Promise.all(
    sessions.map(async (session) => {
      const sessionInvoices = await db.invoices.where("sessionId").equals(session.id).toArray();
      const sessionPayments = await db.payments.where("sessionId").equals(session.id).toArray();
      const activeMatches = await db.matches
        .where("sessionId")
        .equals(session.id)
        .filter((m) => m.active)
        .toArray();

      return {
        id: session.id,
        filename: session.filename,
        name: session.name,
        importedAt: session.importedAt,
        invoiceCount: sessionInvoices.length,
        paymentCount: sessionPayments.length,
        matchedCount: activeMatches.length,
      };
    }),
  );

  return summaries;
}

export async function deleteAllSessions() {
  const db = getDb();
  const sessions = await db.importSessions.toArray();
  const deletedCount = sessions.length;
  const payerKeysDeleted = await deleteAllPayerKeys();

  await db.transaction(
    "rw",
    [db.importSessions, db.invoices, db.payments, db.matches, db.matchAudits],
    async () => {
      await db.importSessions.clear();
      await db.invoices.clear();
      await db.payments.clear();
      await db.matches.clear();
      await db.matchAudits.clear();
    },
  );

  return { deletedCount, payerKeysDeleted };
}

export async function getUnmatchedForLinking(sessionId: string) {
  const db = getDb();
  const activeMatches = await db.matches
    .where("sessionId")
    .equals(sessionId)
    .filter((m) => m.active)
    .toArray();
  const matchedInvoiceIds = new Set(activeMatches.map((m) => m.invoiceId));
  const matchedPaymentIds = new Set(activeMatches.map((m) => m.paymentId));

  const sessionInvoices = await db.invoices.where("sessionId").equals(sessionId).toArray();
  const sessionPayments = await db.payments.where("sessionId").equals(sessionId).toArray();

  return {
    unmatchedInvoices: sessionInvoices.filter((i) => !matchedInvoiceIds.has(i.id)),
    unmatchedPayments: sessionPayments.filter((p) => !matchedPaymentIds.has(p.id)),
  };
}

export async function getRecordsForOverride(sessionId: string, matchId: string) {
  const db = getDb();
  const activeMatches = await db.matches
    .where("sessionId")
    .equals(sessionId)
    .filter((m) => m.active)
    .toArray();
  const otherMatchedInvoiceIds = new Set(
    activeMatches.filter((m) => m.id !== matchId).map((m) => m.invoiceId),
  );
  const otherMatchedPaymentIds = new Set(
    activeMatches.filter((m) => m.id !== matchId).map((m) => m.paymentId),
  );

  const sessionInvoices = await db.invoices.where("sessionId").equals(sessionId).toArray();
  const sessionPayments = await db.payments.where("sessionId").equals(sessionId).toArray();

  return {
    availableInvoices: sessionInvoices.filter((i) => !otherMatchedInvoiceIds.has(i.id)),
    availablePayments: sessionPayments.filter((p) => !otherMatchedPaymentIds.has(p.id)),
  };
}
