import { parseExcelBuffer } from "@/lib/excel/parser";
import { hr } from "@/lib/i18n/hr";
import { isOpenAmount, openAmountFor } from "@/lib/matching/allocate";
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
  session: { id: string; filename: string; name: string; importedAt: Date; updatedAt?: Date };
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
  const invoiceOpen = new Map(
    sessionInvoices.map((invoice) => [
      invoice.id,
      openAmountFor(
        invoice.total,
        activeMatches.filter((match) => match.invoiceId === invoice.id),
      ),
    ]),
  );
  const paymentOpen = new Map(
    sessionPayments.map((payment) => [
      payment.id,
      openAmountFor(
        Math.abs(payment.amount),
        activeMatches.filter((match) => match.paymentId === payment.id),
      ),
    ]),
  );
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
    openAmount: invoiceOpen.get(inv.id) ?? inv.total,
  });

  const toPayment = (pay: (typeof sessionPayments)[0]) => ({
    id: pay.id,
    paymentDate: pay.paymentDate,
    amount: pay.amount,
    client: pay.client,
    description: pay.description,
    openAmount: paymentOpen.get(pay.id) ?? Math.abs(pay.amount),
  });

  for (const match of activeMatches) {
    const inv = invoiceMap.get(match.invoiceId);
    const pay = paymentMap.get(match.paymentId);
    records.push({
      matchId: match.id,
      matchStatus: match.status,
      confidence: match.confidence,
      matchReasons: match.matchReasons,
      allocatedAmount: match.allocatedAmount ?? null,
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
      updatedAt: session.updatedAt,
    },
    records,
    stats: {
      totalInvoices: sessionInvoices.length,
      totalPayments: sessionPayments.length,
      totalInvoiceAmount: sessionInvoices.reduce((sum, inv) => sum + inv.total, 0),
      totalPaymentAmount: sessionPayments.reduce((sum, pay) => sum + Math.abs(pay.amount), 0),
      matched,
      unmatchedInvoices: sessionInvoices.filter((invoice) =>
        isOpenAmount(invoiceOpen.get(invoice.id) ?? invoice.total),
      ).length,
      unmatchedPayments: sessionPayments.filter((payment) =>
        isOpenAmount(paymentOpen.get(payment.id) ?? Math.abs(payment.amount)),
      ).length,
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

export async function mergeSessions(intoId: string, fromId: string) {
  if (intoId === fromId) throw new Error(hr.api.sessionNotFound);
  const db = getDb();
  const [into, from] = await Promise.all([
    db.importSessions.get(intoId),
    db.importSessions.get(fromId),
  ]);
  if (!into || !from) throw new Error(hr.api.sessionNotFound);

  const [intoInvoices, fromInvoices, intoPayments, fromPayments, fromMatches] = await Promise.all([
    db.invoices.where("sessionId").equals(intoId).toArray(),
    db.invoices.where("sessionId").equals(fromId).toArray(),
    db.payments.where("sessionId").equals(intoId).toArray(),
    db.payments.where("sessionId").equals(fromId).toArray(),
    db.matches.where("sessionId").equals(fromId).toArray(),
  ]);

  const invoiceByNumber = new Map(intoInvoices.map((invoice) => [invoice.invoiceNumber, invoice.id]));
  const paymentByHash = new Map(intoPayments.map((payment) => [payment.rowHash, payment.id]));
  const invoiceIdMap = new Map<string, string>();
  const paymentIdMap = new Map<string, string>();
  const invoicesToMove: string[] = [];
  const invoicesToDelete: string[] = [];
  const paymentsToMove: string[] = [];
  const paymentsToDelete: string[] = [];

  for (const invoice of fromInvoices) {
    const existingId = invoiceByNumber.get(invoice.invoiceNumber);
    if (existingId) {
      invoiceIdMap.set(invoice.id, existingId);
      invoicesToDelete.push(invoice.id);
    } else {
      invoiceIdMap.set(invoice.id, invoice.id);
      invoicesToMove.push(invoice.id);
      invoiceByNumber.set(invoice.invoiceNumber, invoice.id);
    }
  }

  for (const payment of fromPayments) {
    const existingId = paymentByHash.get(payment.rowHash);
    if (existingId) {
      paymentIdMap.set(payment.id, existingId);
      paymentsToDelete.push(payment.id);
    } else {
      paymentIdMap.set(payment.id, payment.id);
      paymentsToMove.push(payment.id);
      paymentByHash.set(payment.rowHash, payment.id);
    }
  }

  const intoMatches = await db.matches.where("sessionId").equals(intoId).toArray();
  const activePairs = new Set(
    intoMatches.filter((match) => match.active).map((match) => `${match.invoiceId}|${match.paymentId}`),
  );

  await db.transaction(
    "rw",
    [db.importSessions, db.invoices, db.payments, db.matches, db.matchAudits],
    async () => {
      if (invoicesToMove.length > 0) {
        await db.invoices.where("id").anyOf(invoicesToMove).modify({ sessionId: intoId });
      }
      if (invoicesToDelete.length > 0) await db.invoices.bulkDelete(invoicesToDelete);
      if (paymentsToMove.length > 0) {
        await db.payments.where("id").anyOf(paymentsToMove).modify({ sessionId: intoId });
      }
      if (paymentsToDelete.length > 0) await db.payments.bulkDelete(paymentsToDelete);

      for (const match of fromMatches) {
        const invoiceId = invoiceIdMap.get(match.invoiceId) ?? match.invoiceId;
        const paymentId = paymentIdMap.get(match.paymentId) ?? match.paymentId;
        const pair = `${invoiceId}|${paymentId}`;
        if (match.active && activePairs.has(pair)) {
          await db.matches.delete(match.id);
          continue;
        }
        if (match.active) activePairs.add(pair);
        await db.matches.update(match.id, { sessionId: intoId, invoiceId, paymentId });
      }

      await db.matchAudits.where("sessionId").equals(fromId).modify({ sessionId: intoId });
      await db.importSessions.delete(fromId);
      await db.importSessions.update(intoId, { updatedAt: new Date() });
    },
  );
}

export async function deleteSession(sessionId: string) {
  const db = getDb();
  const session = await db.importSessions.get(sessionId);
  if (!session) throw new Error(hr.api.sessionNotFound);

  await db.transaction(
    "rw",
    [db.importSessions, db.invoices, db.payments, db.matches, db.matchAudits],
    async () => {
      await db.invoices.where("sessionId").equals(sessionId).delete();
      await db.payments.where("sessionId").equals(sessionId).delete();
      await db.matches.where("sessionId").equals(sessionId).delete();
      await db.matchAudits.where("sessionId").equals(sessionId).delete();
      await db.importSessions.delete(sessionId);
    },
  );
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

export type LinkInvoiceSource = {
  kind: "invoice";
  invoiceNumber: string;
  invoiceDate: string;
  client: string;
  total: number;
  openAmount: number;
};

export type LinkPaymentSource = {
  kind: "payment";
  paymentDate: string;
  client: string;
  amount: number;
  description: string;
  openAmount: number;
};

export async function getLinkSource(
  sessionId: string,
  sourceId: string,
  kind: "invoice" | "payment",
): Promise<LinkInvoiceSource | LinkPaymentSource | null> {
  const db = getDb();
  const activeMatches = await db.matches
    .where("sessionId")
    .equals(sessionId)
    .filter((match) => match.active)
    .toArray();

  if (kind === "invoice") {
    const invoice = await db.invoices.get(sourceId);
    if (!invoice || invoice.sessionId !== sessionId) return null;
    return {
      kind: "invoice",
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      client: invoice.client,
      total: invoice.total,
      openAmount: openAmountFor(
        invoice.total,
        activeMatches.filter((match) => match.invoiceId === invoice.id),
      ),
    };
  }

  const payment = await db.payments.get(sourceId);
  if (!payment || payment.sessionId !== sessionId) return null;
  return {
    kind: "payment",
    paymentDate: payment.paymentDate,
    client: payment.client,
    amount: payment.amount,
    description: payment.description,
    openAmount: openAmountFor(
      Math.abs(payment.amount),
      activeMatches.filter((match) => match.paymentId === payment.id),
    ),
  };
}

export async function getUnmatchedForLinking(sessionId: string) {
  const db = getDb();
  const activeMatches = await db.matches
    .where("sessionId")
    .equals(sessionId)
    .filter((m) => m.active)
    .toArray();
  const sessionInvoices = await db.invoices.where("sessionId").equals(sessionId).toArray();
  const sessionPayments = await db.payments.where("sessionId").equals(sessionId).toArray();
  const invoiceOpen = new Map(
    sessionInvoices.map((invoice) => [
      invoice.id,
      openAmountFor(
        invoice.total,
        activeMatches.filter((match) => match.invoiceId === invoice.id),
      ),
    ]),
  );
  const paymentOpen = new Map(
    sessionPayments.map((payment) => [
      payment.id,
      openAmountFor(
        Math.abs(payment.amount),
        activeMatches.filter((match) => match.paymentId === payment.id),
      ),
    ]),
  );

  return {
    unmatchedInvoices: sessionInvoices.filter((invoice) =>
      isOpenAmount(invoiceOpen.get(invoice.id) ?? invoice.total),
    ),
    unmatchedPayments: sessionPayments.filter((payment) =>
      isOpenAmount(paymentOpen.get(payment.id) ?? Math.abs(payment.amount)),
    ),
  };
}

export async function getRecordsForOverride(sessionId: string, matchId: string) {
  const db = getDb();
  const activeMatches = await db.matches
    .where("sessionId")
    .equals(sessionId)
    .filter((m) => m.active)
    .toArray();
  const otherMatches = activeMatches.filter((match) => match.id !== matchId);
  const sessionInvoices = await db.invoices.where("sessionId").equals(sessionId).toArray();
  const sessionPayments = await db.payments.where("sessionId").equals(sessionId).toArray();
  const invoiceOpen = new Map(
    sessionInvoices.map((invoice) => [
      invoice.id,
      openAmountFor(
        invoice.total,
        otherMatches.filter((match) => match.invoiceId === invoice.id),
      ),
    ]),
  );
  const paymentOpen = new Map(
    sessionPayments.map((payment) => [
      payment.id,
      openAmountFor(
        Math.abs(payment.amount),
        otherMatches.filter((match) => match.paymentId === payment.id),
      ),
    ]),
  );

  return {
    availableInvoices: sessionInvoices.filter((invoice) =>
      isOpenAmount(invoiceOpen.get(invoice.id) ?? invoice.total),
    ),
    availablePayments: sessionPayments.filter((payment) =>
      isOpenAmount(paymentOpen.get(payment.id) ?? Math.abs(payment.amount)),
    ),
  };
}
