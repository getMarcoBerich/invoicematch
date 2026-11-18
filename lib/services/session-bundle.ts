import { hr } from "@/lib/i18n/hr";
import type { MatchReason } from "@/lib/types";
import { getDb, type ClientPayerKeyRow, type InvoiceRow, type MatchRow, type PaymentRow } from "@/lib/storage/db";
import { nanoid } from "nanoid";

export type SessionBundle = {
  version: 1;
  exportedAt: string;
  payerKeys: { clientNormalized: string; payerKey: string }[];
  sessions: {
    filename: string;
    name: string;
    importedAt: string;
    invoices: Omit<InvoiceRow, "id" | "sessionId">[];
    payments: Omit<PaymentRow, "id" | "sessionId">[];
    matches: {
      invoiceIndex: number;
      paymentIndex: number;
      status: MatchRow["status"];
      confidence: number;
      matchReasons: MatchReason[];
      allocatedAmount?: number;
      active: boolean;
      createdAt: string;
    }[];
  }[];
};

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export async function buildSessionBundle(sessionIds?: string[]): Promise<SessionBundle> {
  const db = getDb();
  const sessions = await db.importSessions.toArray();
  const selected = sessionIds ? sessions.filter((session) => sessionIds.includes(session.id)) : sessions;
  const payerKeys = await db.clientPayerKeys.toArray();

  const bundled = [];
  for (const session of selected) {
    const invoices = await db.invoices.where("sessionId").equals(session.id).toArray();
    const payments = await db.payments.where("sessionId").equals(session.id).toArray();
    const matches = await db.matches.where("sessionId").equals(session.id).toArray();
    const invoiceIndex = new Map(invoices.map((invoice, index) => [invoice.id, index]));
    const paymentIndex = new Map(payments.map((payment, index) => [payment.id, index]));

    bundled.push({
      filename: session.filename,
      name: session.name,
      importedAt: toIso(session.importedAt),
      invoices: invoices.map(({ id: _id, sessionId: _sessionId, ...invoice }) => invoice),
      payments: payments.map(({ id: _id, sessionId: _sessionId, ...payment }) => payment),
      matches: matches.flatMap((match) => {
        const invoiceAt = invoiceIndex.get(match.invoiceId);
        const paymentAt = paymentIndex.get(match.paymentId);
        if (invoiceAt === undefined || paymentAt === undefined) return [];
        return [
          {
            invoiceIndex: invoiceAt,
            paymentIndex: paymentAt,
            status: match.status,
            confidence: match.confidence,
            matchReasons: match.matchReasons,
            ...(match.allocatedAmount != null ? { allocatedAmount: match.allocatedAmount } : {}),
            active: match.active,
            createdAt: toIso(match.createdAt),
          },
        ];
      }),
    });
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    payerKeys: payerKeys.map((row) => ({
      clientNormalized: row.clientNormalized,
      payerKey: row.payerKey,
    })),
    sessions: bundled,
  };
}

export function sessionBundleFilename(sessionName?: string): string {
  const base = (sessionName ?? hr.export.sessionBundleAll)
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${hr.export.sessionBundlePrefix}-${base || "sesija"}.json`;
}

export function downloadJsonFile(content: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(content, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importSessionBundle(raw: unknown): Promise<string[]> {
  if (!raw || typeof raw !== "object") throw new Error(hr.api.importFailed);
  const bundle = raw as Partial<SessionBundle>;
  if (bundle.version !== 1 || !Array.isArray(bundle.sessions)) throw new Error(hr.api.importFailed);

  const db = getDb();
  const sessionIds: string[] = [];

  await db.transaction(
    "rw",
    [db.importSessions, db.invoices, db.payments, db.matches, db.clientPayerKeys],
    async () => {
      for (const key of bundle.payerKeys ?? []) {
        if (!key?.clientNormalized || !key.payerKey) continue;
        const row: ClientPayerKeyRow = {
          clientNormalized: key.clientNormalized,
          payerKey: key.payerKey,
          updatedAt: new Date(),
        };
        await db.clientPayerKeys.put(row);
      }

      for (const session of bundle.sessions ?? []) {
        if (!session || !Array.isArray(session.invoices) || !Array.isArray(session.payments)) continue;
        const sessionId = nanoid();
        sessionIds.push(sessionId);
        await db.importSessions.add({
          id: sessionId,
          filename: session.filename || "sesija.json",
          name: session.name || session.filename || "Sesija",
          importedAt: new Date(session.importedAt || Date.now()),
        });

        const invoiceIds = (session.invoices ?? []).map(() => nanoid());
        const paymentIds = (session.payments ?? []).map(() => nanoid());
        if (invoiceIds.length > 0) {
          await db.invoices.bulkAdd(
            session.invoices.map((invoice, index) => ({
              ...invoice,
              id: invoiceIds[index],
              sessionId,
            })),
          );
        }
        if (paymentIds.length > 0) {
          await db.payments.bulkAdd(
            session.payments.map((payment, index) => ({
              ...payment,
              id: paymentIds[index],
              sessionId,
            })),
          );
        }
        for (const match of session.matches ?? []) {
          const invoiceId = invoiceIds[match.invoiceIndex];
          const paymentId = paymentIds[match.paymentIndex];
          if (!invoiceId || !paymentId) continue;
          await db.matches.add({
            id: nanoid(),
            sessionId,
            invoiceId,
            paymentId,
            status: match.status,
            confidence: match.confidence,
            matchReasons: match.matchReasons ?? [],
            allocatedAmount: match.allocatedAmount,
            createdAt: new Date(match.createdAt || Date.now()),
            active: match.active !== false,
          });
        }
      }
    },
  );

  return sessionIds;
}
