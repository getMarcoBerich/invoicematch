import { foldClientName } from "@/lib/clients/payer-keys";

const STOPWORDS = new Set([
  "ZAGREB",
  "ZAGREBU",
  "SPLIT",
  "SPLITU",
  "RIJEKA",
  "RIJECI",
  "OSIJEK",
  "OSIJEKU",
  "DUBROVNIK",
  "DUBROVNIKU",
  "CROATIA",
  "HRVATSKA",
  "CONSULTING",
  "COMPANY",
  "SERVIS",
  "SERVISI",
  "GROUP",
  "GRUPA",
  "INTERNATIONAL",
  "USLUGE",
  "USLUGA",
  "TRGOVINA",
  "TRGOVINU",
  "TRGOVINE",
  "AGENCIJA",
  "AGENCIJE",
  "TURISTICKA",
  "TURISTICKI",
  "TURISTICKO",
  "TEHNOLOGIJE",
  "TEHNOLOGIJA",
  "TRAVEL",
]);

export type PayerKeyClient = {
  name: string;
  payerKey: string;
  isCustomKey: boolean;
};

export type PayerKeySuggestion = {
  payerKey: string;
  clients: string[];
};

function tokens(name: string): string[] {
  return foldClientName(name)
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));
}

function similar(a: string, b: string): boolean {
  const left = tokens(a);
  const right = new Set(tokens(b));
  const shared = left.filter((token) => right.has(token));
  if (shared.some((token) => token.length >= 5)) return true;
  const compact = (value: string) => foldClientName(value).replace(/[^A-Z0-9]/g, "");
  const compactA = compact(a);
  const compactB = compact(b);
  return compactA.length >= 6 && compactA === compactB;
}

function suggestedKey(names: string[], customKeys: string[]): string {
  if (customKeys.length > 0) {
    const counts = new Map<string, number>();
    for (const key of customKeys) counts.set(key, (counts.get(key) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "hr"))[0][0];
  }
  const counts = new Map<string, number>();
  for (const name of names) {
    for (const token of new Set(tokens(name))) counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  const shared = [...counts.entries()]
    .filter(([, count]) => count === names.length)
    .sort((a, b) => b[0].length - a[0].length);
  if (shared.length > 0) return shared[0][0];
  return [...names].sort((a, b) => a.length - b.length)[0];
}

export function suggestPayerKeys(clients: PayerKeyClient[]): PayerKeySuggestion[] {
  const parent = clients.map((_, index) => index);
  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index]);
    return parent[index];
  };
  const unite = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };

  for (let i = 0; i < clients.length; i++) {
    for (let j = i + 1; j < clients.length; j++) {
      if (similar(clients[i].name, clients[j].name)) unite(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  clients.forEach((_, index) => {
    const root = find(index);
    const list = groups.get(root) ?? [];
    list.push(index);
    groups.set(root, list);
  });

  const suggestions: PayerKeySuggestion[] = [];
  for (const indexes of groups.values()) {
    if (indexes.length < 2) continue;
    const members = indexes.map((index) => clients[index]);
    const keys = new Set(members.map((member) => member.payerKey));
    if (keys.size === 1) continue;
    const names = members.map((member) => member.name).sort((a, b) => a.localeCompare(b, "hr"));
    suggestions.push({
      payerKey: suggestedKey(
        names,
        members.filter((member) => member.isCustomKey).map((member) => member.payerKey),
      ),
      clients: names,
    });
  }

  return suggestions.sort((a, b) => a.payerKey.localeCompare(b.payerKey, "hr")).slice(0, 8);
}
