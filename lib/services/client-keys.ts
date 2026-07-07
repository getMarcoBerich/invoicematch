import {
  normalizeClient,
  resolvePayerKey,
  type PayerKeyMap,
} from "@/lib/clients/payer-keys";
import { hr } from "@/lib/i18n/hr";
import { getDb } from "@/lib/storage/db";

function buildSessionPayerGroups(sessionClients: string[], map: PayerKeyMap) {
  const sessionNormalized = new Set(sessionClients.map(normalizeClient));
  const relevantPayerKeys = new Set<string>();

  for (const name of sessionClients) {
    relevantPayerKeys.add(resolvePayerKey(normalizeClient(name), map));
  }

  const groups = new Map<string, Set<string>>();

  for (const name of sessionClients) {
    const key = resolvePayerKey(normalizeClient(name), map);
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key)!.add(name);
  }

  for (const [normalized, payerKey] of map) {
    if (!relevantPayerKeys.has(payerKey)) continue;
    if (sessionNormalized.has(normalized)) continue;
    if (!groups.has(payerKey)) groups.set(payerKey, new Set());
    groups.get(payerKey)!.add(normalized);
  }

  return [...groups.entries()]
    .map(([payerKey, clients]) => ({
      payerKey,
      clients: [...clients].sort((a, b) => a.localeCompare(b, "hr")),
      hasAliases: [...clients].some((name) => !sessionNormalized.has(normalizeClient(name))),
      resettable:
        clients.size > 1 && [...clients].some((name) => map.has(normalizeClient(name))),
    }))
    .sort((a, b) => a.payerKey.localeCompare(b.payerKey, "hr"));
}

export async function loadPayerKeyMap(): Promise<PayerKeyMap> {
  const db = getDb();
  const rows = await db.clientPayerKeys.toArray();
  return new Map(rows.map((r) => [r.clientNormalized, r.payerKey]));
}

export async function setClientPayerKey(clientName: string, payerKey: string) {
  const db = getDb();
  const clientNormalized = normalizeClient(clientName);
  const trimmedKey = payerKey.trim();
  if (!trimmedKey) throw new Error(hr.clientKeys.saveFailed);

  const now = new Date();
  await db.clientPayerKeys.put({
    clientNormalized,
    payerKey: trimmedKey,
    updatedAt: now,
  });

  return { clientNormalized, payerKey: trimmedKey };
}

export async function removeClientPayerKey(clientName: string) {
  await removeClientPayerKeys([clientName]);
}

export async function removeClientPayerKeys(clientNames: string[]) {
  if (!clientNames.length) return;
  const db = getDb();
  const normalized = [...new Set(clientNames.map(normalizeClient))];
  await db.clientPayerKeys.bulkDelete(normalized);
}

export async function deleteAllPayerKeys() {
  const db = getDb();
  const count = await db.clientPayerKeys.count();
  if (count === 0) {
    return 0;
  }

  await db.clientPayerKeys.clear();
  return count;
}

export async function getSessionClientKeys(sessionId: string) {
  const db = getDb();
  const map = await loadPayerKeyMap();

  const sessionInvoices = await db.invoices.where("sessionId").equals(sessionId).toArray();
  const sessionPayments = await db.payments.where("sessionId").equals(sessionId).toArray();

  const uniqueClients = new Set<string>();
  for (const inv of sessionInvoices) uniqueClients.add(inv.client);
  for (const pay of sessionPayments) uniqueClients.add(pay.client);

  const clients = [...uniqueClients].sort((a, b) => a.localeCompare(b, "hr"));
  const sessionNormalized = new Set(clients.map(normalizeClient));
  const groups = buildSessionPayerGroups(clients, map);
  const distinctKeys = await getDistinctPayerKeys();
  const allPayerKeys = [...new Set([...distinctKeys, ...groups.map((g) => g.payerKey)])].sort(
    (a, b) => a.localeCompare(b, "hr"),
  );

  const extraAliases = [...map.entries()]
    .filter(([normalized]) => !sessionNormalized.has(normalized))
    .map(([normalized, payerKey]) => ({ name: normalized, payerKey }))
    .sort((a, b) => a.name.localeCompare(b.name, "hr"));

  return {
    clients: clients.map((name) => {
      const normalized = normalizeClient(name);
      const payerKey = map.get(normalized) ?? normalized;
      const isCustomKey = map.has(normalized);
      return { name, normalized, payerKey, isCustomKey };
    }),
    groups,
    allPayerKeys,
    extraAliases,
    payerKeyMap: Object.fromEntries(map),
  };
}

export async function getDistinctPayerKeys(): Promise<string[]> {
  const db = getDb();
  const rows = await db.clientPayerKeys.toArray();
  return [...new Set(rows.map((r) => r.payerKey))].sort((a, b) => a.localeCompare(b, "hr"));
}
