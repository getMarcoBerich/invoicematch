import Dexie, { type Table } from "dexie";
import type { MatchReason } from "@/lib/types";
import { defaultSessionName } from "@/lib/session-name";

export type ImportSessionRow = {
  id: string;
  filename: string;
  name: string;
  importedAt: Date;
};

export type InvoiceRow = {
  id: string;
  sessionId: string;
  invoiceNumber: string;
  invoiceDate: string;
  client: string;
  baseAmount: number;
  vat: number;
  total: number;
  rowHash: string;
};

export type PaymentRow = {
  id: string;
  sessionId: string;
  paymentDate: string;
  amount: number;
  client: string;
  description: string;
  rowHash: string;
};

export type MatchRow = {
  id: string;
  sessionId: string;
  invoiceId: string;
  paymentId: string;
  status: "auto" | "manual" | "overridden";
  confidence: number;
  matchReasons: MatchReason[];
  createdAt: Date;
  active: boolean;
};

export type MatchAuditRow = {
  id: string;
  matchId: string | null;
  sessionId: string;
  action: "created" | "unlinked" | "relinked" | "overridden";
  at: Date;
  meta?: Record<string, unknown>;
};

export type ClientPayerKeyRow = {
  clientNormalized: string;
  payerKey: string;
  updatedAt: Date;
};

class InvoiceMatchDatabase extends Dexie {
  importSessions!: Table<ImportSessionRow, string>;
  invoices!: Table<InvoiceRow, string>;
  payments!: Table<PaymentRow, string>;
  matches!: Table<MatchRow, string>;
  matchAudits!: Table<MatchAuditRow, string>;
  clientPayerKeys!: Table<ClientPayerKeyRow, string>;

  constructor() {
    super("invoicematch");
    this.version(1).stores({
      importSessions: "id, importedAt",
      invoices: "id, sessionId",
      payments: "id, sessionId",
      matches: "id, sessionId, invoiceId, paymentId, active",
      matchAudits: "id, sessionId, at",
      clientPayerKeys: "clientNormalized, payerKey",
    });
    this.version(2)
      .stores({
        importSessions: "id, importedAt, name",
        invoices: "id, sessionId",
        payments: "id, sessionId",
        matches: "id, sessionId, invoiceId, paymentId, active",
        matchAudits: "id, sessionId, at",
        clientPayerKeys: "clientNormalized, payerKey",
      })
      .upgrade(async (tx) => {
        await tx.table("importSessions").toCollection().modify((session) => {
          if (!session.name) {
            session.name = defaultSessionName(session.filename);
          }
        });
      });
  }
}

let database: InvoiceMatchDatabase | undefined;

export function getDb(): InvoiceMatchDatabase {
  if (typeof indexedDB === "undefined") {
    throw new Error("Database is only available in the browser");
  }
  if (!database) {
    database = new InvoiceMatchDatabase();
  }
  return database;
}

export async function clearAllData() {
  const db = getDb();
  await db.transaction(
    "rw",
    [
      db.importSessions,
      db.invoices,
      db.payments,
      db.matches,
      db.matchAudits,
      db.clientPayerKeys,
    ],
    async () => {
      await db.importSessions.clear();
      await db.invoices.clear();
      await db.payments.clear();
      await db.matches.clear();
      await db.matchAudits.clear();
      await db.clientPayerKeys.clear();
    },
  );
}
