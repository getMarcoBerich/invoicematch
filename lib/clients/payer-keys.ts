import { normalizeClientName } from "@/lib/excel/normalize";

export type PayerKeyMap = Map<string, string>;

/** Resolve payer key; unmapped clients use their normalized name as their own key. */
export function resolvePayerKey(clientNormalized: string, map: PayerKeyMap): string {
  return map.get(clientNormalized) ?? clientNormalized;
}

export function attachPayerKeys<T extends { clientNormalized: string }>(
  items: T[],
  map: PayerKeyMap,
): (T & { payerKey: string })[] {
  return items.map((item) => ({
    ...item,
    payerKey: resolvePayerKey(item.clientNormalized, map),
  }));
}

export function normalizeClient(client: string): string {
  return normalizeClientName(client);
}

export type PayerKeyGroup = {
  payerKey: string;
  clients: string[];
};

export function groupByPayerKey(
  clientNames: string[],
  map: PayerKeyMap,
): PayerKeyGroup[] {
  const groups = new Map<string, Set<string>>();

  for (const name of clientNames) {
    const normalized = normalizeClient(name);
    const key = resolvePayerKey(normalized, map);
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key)!.add(name);
  }

  return [...groups.entries()]
    .map(([payerKey, clients]) => ({
      payerKey,
      clients: [...clients].sort(),
    }))
    .sort((a, b) => a.payerKey.localeCompare(b.payerKey, "hr"));
}
