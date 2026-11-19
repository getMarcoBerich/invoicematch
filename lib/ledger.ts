import type { FilterState } from "@/components/filter-panel";
import {
  normalizeClient,
  resolvePayerKey,
  type PayerKeyMap,
} from "@/lib/clients/payer-keys";
import type { RecordRow } from "@/lib/types";

export type LedgerLineKind = "invoice" | "payment";

export type LedgerLine = {
  id: string;
  kind: LedgerLineKind;
  date: string;
  client: string;
  document: string;
  debit: number;
  credit: number;
  balance: number;
  openAmount: number;
  daysOpen: number | null;
};

export type ClientLedger = {
  payerKey: string;
  clients: string[];
  label: string;
  invoiceCount: number;
  paymentCount: number;
  invoiced: number;
  paid: number;
  balance: number;
  lines: LedgerLine[];
};

export type LedgerTotals = {
  invoiced: number;
  paid: number;
  invoiceCount: number;
  paymentCount: number;
  balance: number;
};

type DraftLine = Omit<LedgerLine, "balance" | "daysOpen">;

function ledgerLabel(payerKey: string, clients: string[]): string {
  if (clients.length === 1) return clients[0];
  const sharesNormalizedName = clients.every((name) => normalizeClient(name) === payerKey);
  if (!sharesNormalizedName) return payerKey;
  return [...clients].sort(
    (a, b) => b.length - a.length || a.localeCompare(b, "hr"),
  )[0];
}

function inDateRange(date: string, filters: FilterState): boolean {
  if (!filters.dateFrom && !filters.dateTo) return true;
  if (!date) return false;
  if (filters.dateFrom && date < filters.dateFrom) return false;
  if (filters.dateTo && date > filters.dateTo) return false;
  return true;
}

function inAmountRange(amount: number, filters: FilterState): boolean {
  if (!filters.amountMin && !filters.amountMax) return true;
  const absAmount = Math.abs(amount);
  if (filters.amountMin && absAmount < Number(filters.amountMin)) return false;
  if (filters.amountMax && absAmount > Number(filters.amountMax)) return false;
  return true;
}

function matchesSearch(parts: Array<string | undefined>, search: string): boolean {
  if (!search) return true;
  const haystack = parts.filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(search.toLowerCase());
}

function documentVisible(line: DraftLine, payerKey: string, filters: FilterState): boolean {
  if (filters.client !== "all" && line.client !== filters.client) return false;
  if (filters.payerKey !== "all" && payerKey !== filters.payerKey) return false;
  if (!inDateRange(line.date, filters)) return false;
  const amount = line.kind === "invoice" ? line.debit : line.credit;
  if (!inAmountRange(amount, filters)) return false;
  return matchesSearch([line.client, payerKey, line.document], filters.search);
}

function compareLines(a: DraftLine, b: DraftLine): number {
  if (!a.date && b.date) return 1;
  if (a.date && !b.date) return -1;
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  if (a.kind !== b.kind) return a.kind === "invoice" ? -1 : 1;
  return a.document.localeCompare(b.document, "hr");
}

function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function daysBetween(from: string, to: string): number | null {
  if (!from) return null;
  const start = Date.parse(`${from}T00:00:00`);
  const end = Date.parse(`${to}T00:00:00`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(0, Math.round((end - start) / 86400000));
}

export function buildClientLedgers(
  records: RecordRow[],
  filters: FilterState,
  payerKeyMap: PayerKeyMap = new Map(),
  asOf = isoDate(new Date()),
): ClientLedger[] {
  const groups = new Map<string, { payerKey: string; clients: Set<string>; lines: DraftLine[] }>();
  const seen = new Set<string>();

  const consider = (line: DraftLine) => {
    const client = line.client.trim();
    if (!client) return;
    const payerKey = resolvePayerKey(normalizeClient(client), payerKeyMap);
    if (!documentVisible({ ...line, client }, payerKey, filters)) return;
    const dedupeKey = `${line.kind}:${line.id}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    let group = groups.get(payerKey);
    if (!group) {
      group = { payerKey, clients: new Set(), lines: [] };
      groups.set(payerKey, group);
    }
    group.clients.add(client);
    group.lines.push({ ...line, client });
  };

  for (const record of records) {
    if (record.invoice) {
      consider({
        id: record.invoice.id,
        kind: "invoice",
        date: record.invoice.invoiceDate,
        client: record.invoice.client,
        document: record.invoice.invoiceNumber,
        debit: record.invoice.total,
        credit: 0,
        openAmount: record.invoice.openAmount ?? (record.payment ? 0 : record.invoice.total),
      });
    }
    if (record.payment) {
      consider({
        id: record.payment.id,
        kind: "payment",
        date: record.payment.paymentDate,
        client: record.payment.client,
        document: record.payment.description,
        debit: 0,
        credit: record.payment.amount,
        openAmount:
          record.payment.openAmount ?? (record.invoice ? 0 : Math.abs(record.payment.amount)),
      });
    }
  }

  return [...groups.values()]
    .map((group) => {
      const clients = [...group.clients].sort((a, b) => a.localeCompare(b, "hr"));
      const sorted = [...group.lines].sort(compareLines);
      let running = 0;
      const lines = sorted.map((line) => {
        running += line.debit - line.credit;
        return {
          ...line,
          balance: running,
          daysOpen:
            line.kind === "invoice" && line.openAmount > 0.01 ? daysBetween(line.date, asOf) : null,
        };
      });
      const invoiced = lines.reduce((sum, line) => sum + line.debit, 0);
      const paid = lines.reduce((sum, line) => sum + line.credit, 0);
      return {
        payerKey: group.payerKey,
        clients,
        label: ledgerLabel(group.payerKey, clients),
        invoiceCount: lines.filter((line) => line.kind === "invoice").length,
        paymentCount: lines.filter((line) => line.kind === "payment").length,
        invoiced,
        paid,
        balance: invoiced - paid,
        lines,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "hr"));
}

export function ledgerTotals(ledgers: ClientLedger[]): LedgerTotals {
  return ledgers.reduce<LedgerTotals>(
    (totals, ledger) => {
      totals.invoiced += ledger.invoiced;
      totals.paid += ledger.paid;
      totals.invoiceCount += ledger.invoiceCount;
      totals.paymentCount += ledger.paymentCount;
      totals.balance += ledger.balance;
      return totals;
    },
    { invoiced: 0, paid: 0, invoiceCount: 0, paymentCount: 0, balance: 0 },
  );
}
