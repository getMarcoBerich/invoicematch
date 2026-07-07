import type { RecordRow } from "@/lib/services/session";
import type { FilterState } from "@/components/filter-panel";
import {
  normalizeClient,
  resolvePayerKey,
  type PayerKeyMap,
} from "@/lib/clients/payer-keys";

export type TabView = "all" | "matched" | "unmatched-invoices" | "unmatched-payments";

export function buildPayerKeyMapFromApi(data: {
  clients?: { normalized: string; payerKey: string; isCustomKey: boolean }[];
  extraAliases?: { name: string; payerKey: string }[];
  payerKeyMap?: Record<string, string>;
}): PayerKeyMap {
  if (data.payerKeyMap) {
    return new Map(Object.entries(data.payerKeyMap));
  }
  const map: PayerKeyMap = new Map();
  for (const client of data.clients ?? []) {
    if (client.isCustomKey) map.set(client.normalized, client.payerKey);
  }
  for (const alias of data.extraAliases ?? []) {
    map.set(alias.name, alias.payerKey);
  }
  return map;
}

function clientPayerKey(client: string | undefined, map: PayerKeyMap): string | null {
  if (!client) return null;
  return resolvePayerKey(normalizeClient(client), map);
}

export function filterRecords(
  records: RecordRow[],
  filters: FilterState,
  tab: TabView,
  payerKeyMap: PayerKeyMap = new Map(),
): RecordRow[] {
  let filtered = records;

  if (tab === "matched") {
    filtered = filtered.filter((r) => r.matchStatus !== "unmatched");
  } else if (tab === "unmatched-invoices") {
    filtered = filtered.filter((r) => r.invoice && !r.payment);
  } else if (tab === "unmatched-payments") {
    filtered = filtered.filter((r) => r.payment && !r.invoice);
  }

  if (filters.status !== "all") {
    filtered = filtered.filter((r) => r.matchStatus === filters.status);
  }

  if (filters.client !== "all") {
    filtered = filtered.filter(
      (r) => r.invoice?.client === filters.client || r.payment?.client === filters.client,
    );
  }

  if (filters.payerKey !== "all") {
    filtered = filtered.filter((r) => {
      const invKey = clientPayerKey(r.invoice?.client, payerKeyMap);
      const payKey = clientPayerKey(r.payment?.client, payerKeyMap);
      return invKey === filters.payerKey || payKey === filters.payerKey;
    });
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter((r) => {
      const haystack = [
        r.invoice?.invoiceNumber,
        r.invoice?.client,
        r.payment?.client,
        r.payment?.description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  if (filters.dateFrom || filters.dateTo) {
    filtered = filtered.filter((r) => {
      const date =
        filters.dateField === "invoice" ? r.invoice?.invoiceDate : r.payment?.paymentDate;
      if (!date) return false;
      if (filters.dateFrom && date < filters.dateFrom) return false;
      if (filters.dateTo && date > filters.dateTo) return false;
      return true;
    });
  }

  if (filters.amountMin || filters.amountMax) {
    filtered = filtered.filter((r) => {
      const amount = r.invoice?.total ?? r.payment?.amount;
      if (amount === undefined || amount === null) return false;
      const absAmount = Math.abs(amount);
      if (filters.amountMin && absAmount < Number(filters.amountMin)) return false;
      if (filters.amountMax && absAmount > Number(filters.amountMax)) return false;
      return true;
    });
  }

  if (filters.confidenceMin) {
    const min = Number(filters.confidenceMin);
    filtered = filtered.filter((r) => r.confidence !== null && r.confidence >= min);
  }

  return filtered;
}

export function collectClients(records: RecordRow[]): string[] {
  const set = new Set<string>();
  for (const r of records) {
    if (r.invoice?.client) set.add(r.invoice.client);
    if (r.payment?.client) set.add(r.payment.client);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "hr"));
}

export function collectPayerKeys(records: RecordRow[], map: PayerKeyMap): string[] {
  const set = new Set<string>();
  for (const r of records) {
    const invKey = clientPayerKey(r.invoice?.client, map);
    const payKey = clientPayerKey(r.payment?.client, map);
    if (invKey) set.add(invKey);
    if (payKey) set.add(payKey);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "hr"));
}
