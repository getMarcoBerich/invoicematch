"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hr } from "@/lib/i18n/hr";
import {
  getSessionClientKeys,
  removeClientPayerKey,
  removeClientPayerKeys,
  setClientPayerKey,
} from "@/lib/services/client-keys";

type ClientEntry = {
  name: string;
  normalized: string;
  payerKey: string;
  isCustomKey: boolean;
};

type PayerGroup = {
  payerKey: string;
  clients: string[];
  hasAliases?: boolean;
  resettable?: boolean;
};

type ExtraAlias = {
  name: string;
  payerKey: string;
};

type ClientKeysPanelProps = {
  sessionId: string;
  onKeysChanged?: () => void;
};

function matchesListSearch(query: string, parts: (string | undefined | null)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export function ClientKeysPanel({ sessionId, onKeysChanged }: ClientKeysPanelProps) {
  const [clients, setClients] = useState<ClientEntry[]>([]);
  const [groups, setGroups] = useState<PayerGroup[]>([]);
  const [extraAliases, setExtraAliases] = useState<ExtraAlias[]>([]);
  const [allPayerKeys, setAllPayerKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [draftKeys, setDraftKeys] = useState<Record<string, string>>({});
  const [newAliasName, setNewAliasName] = useState("");
  const [newAliasKey, setNewAliasKey] = useState("");
  const [listSearch, setListSearch] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const sessionClientNames = new Set(clients.map((c) => c.name));

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getSessionClientKeys(sessionId);
      setClients(data.clients);
      setGroups(data.groups);
      setExtraAliases(data.extraAliases ?? []);
      setAllPayerKeys(data.allPayerKeys);
      const drafts: Record<string, string> = {};
      for (const c of data.clients as ClientEntry[]) {
        drafts[c.name] = c.payerKey;
      }
      setDraftKeys(drafts);
    } catch (err) {
      setClients([]);
      setExtraAliases([]);
      setLoadError(err instanceof Error ? err.message : hr.clientKeys.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredClients = useMemo(
    () =>
      clients.filter((client) =>
        matchesListSearch(listSearch, [
          client.name,
          client.normalized,
          client.payerKey,
          draftKeys[client.name],
        ]),
      ),
    [clients, draftKeys, listSearch],
  );

  const filteredGroups = useMemo(
    () =>
      groups.filter(
        (g) =>
          g.clients.length > 1 &&
          (matchesListSearch(listSearch, [g.payerKey]) ||
            g.clients.some((c) => matchesListSearch(listSearch, [c]))),
      ),
    [groups, listSearch],
  );

  const filteredExtraAliases = useMemo(
    () =>
      extraAliases.filter((alias) =>
        matchesListSearch(listSearch, [alias.name, alias.payerKey]),
      ),
    [extraAliases, listSearch],
  );

  const saveMapping = async (clientName: string, payerKey: string) => {
    const trimmedKey = payerKey.trim();
    if (!trimmedKey) return;

    setSaving(clientName);
    try {
      await setClientPayerKey(clientName, trimmedKey);
      await load();
      onKeysChanged?.();
    } finally {
      setSaving(null);
    }
  };

  const saveKey = (clientName: string) => saveMapping(clientName, draftKeys[clientName] ?? "");

  const addAlias = async () => {
    const name = newAliasName.trim();
    const key = newAliasKey.trim();
    if (!name || !key) return;

    await saveMapping(name, key);
    setNewAliasName("");
    setNewAliasKey("");
  };

  const resetKey = async (clientName: string) => {
    setSaving(clientName);
    try {
      await removeClientPayerKey(clientName);
      await load();
      onKeysChanged?.();
    } finally {
      setSaving(null);
    }
  };

  const resetGroup = async (group: PayerGroup) => {
    const savingId = `group:${group.payerKey}`;
    setSaving(savingId);
    try {
      await removeClientPayerKeys(group.clients);
      await load();
      onKeysChanged?.();
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="shrink-0">
        <h3 className="flex items-center gap-2 font-medium">
          <KeyRound className="size-4 shrink-0" />
          {hr.clientKeys.title}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">{hr.clientKeys.description}</p>
        {loadError ? <p className="mt-1 text-xs text-destructive">{loadError}</p> : null}
      </div>

      <div className="shrink-0 space-y-1">
        <Input
          className="h-8 text-xs"
          placeholder={hr.clientKeys.filterClientsPlaceholder}
          value={listSearch}
          onChange={(e) => setListSearch(e.target.value)}
        />
        {listSearch.trim() ? (
          <p className="text-xs text-muted-foreground">
            {hr.clientKeys.showingClients(filteredClients.length, clients.length)}
          </p>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        {filteredGroups.length > 0 && (
          <div className="max-h-44 min-h-0 shrink-0 overflow-y-auto overflow-x-hidden rounded-lg border bg-muted/30 p-3">
            <p className="mb-2 text-xs font-medium">{hr.clientKeys.groups}</p>
            <div className="space-y-2">
              {filteredGroups.map((g) => (
                <div key={g.payerKey} className="min-w-0 text-xs">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span
                      className="inline-block min-w-0 max-w-full truncate rounded-full border px-2 py-0.5 font-mono text-[11px]"
                      title={g.payerKey}
                    >
                      {g.payerKey}
                    </span>
                    {g.resettable && (
                      <button
                        type="button"
                        className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground underline hover:text-foreground"
                        disabled={saving === `group:${g.payerKey}`}
                        onClick={() => resetGroup(g)}
                      >
                        {saving === `group:${g.payerKey}` && (
                          <Loader2 className="size-3 animate-spin" />
                        )}
                        {hr.clientKeys.resetGroup}
                      </button>
                    )}
                  </div>
                  <ul className="ml-1 list-inside list-disc text-muted-foreground">
                    {g.clients.map((c) => (
                      <li key={c} className="truncate" title={c}>
                        {c}
                        {!sessionClientNames.has(c) && (
                          <span className="ml-1 text-[10px] italic">
                            ({hr.clientKeys.aliasOutsideImport})
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-0.5">
          {filteredClients.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              {hr.clientKeys.noFilterResults}
            </p>
          ) : (
            filteredClients.map((client) => (
              <div key={client.name} className="space-y-1.5 rounded border p-2">
                <p className="truncate text-xs font-medium" title={client.name}>
                  {client.name}
                </p>
                <div className="flex gap-1">
                  <Input
                    list={`payer-keys-${sessionId}`}
                    className="h-7 text-xs"
                    placeholder={hr.clientKeys.keyPlaceholder}
                    value={draftKeys[client.name] ?? client.payerKey}
                    onChange={(e) =>
                      setDraftKeys((d) => ({ ...d, [client.name]: e.target.value }))
                    }
                  />
                  <Button
                    size="sm"
                    className="h-7 shrink-0 px-2 text-xs"
                    disabled={saving === client.name}
                    onClick={() => saveKey(client.name)}
                  >
                    {saving === client.name ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      hr.clientKeys.save
                    )}
                  </Button>
                </div>
                {client.isCustomKey && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                    onClick={() => resetKey(client.name)}
                  >
                    {hr.clientKeys.reset}
                  </button>
                )}
              </div>
            ))
          )}

          {filteredExtraAliases.length > 0 && (
            <div className="min-w-0 space-y-2 overflow-hidden border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground">
                {hr.clientKeys.savedAliases}
              </p>
              {filteredExtraAliases.map((alias) => (
                <div
                  key={alias.name}
                  className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium" title={alias.name}>
                      {alias.name}
                    </p>
                    <p className="truncate text-muted-foreground">
                      → <span className="font-mono">{alias.payerKey}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-muted-foreground underline hover:text-foreground"
                    disabled={saving === alias.name}
                    onClick={() => resetKey(alias.name)}
                  >
                    {hr.clientKeys.reset}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <datalist id={`payer-keys-${sessionId}`}>
        {allPayerKeys.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>

      <div className="shrink-0 space-y-2 rounded-lg border border-dashed p-3">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <Plus className="size-3.5" />
          {hr.clientKeys.addAlias}
        </p>
        <p className="text-xs text-muted-foreground">{hr.clientKeys.addAliasHint}</p>
        <Input
          className="h-7 text-xs"
          placeholder={hr.clientKeys.aliasNamePlaceholder}
          value={newAliasName}
          onChange={(e) => setNewAliasName(e.target.value)}
        />
        <div className="flex gap-1">
          <Input
            list={`payer-keys-${sessionId}`}
            className="h-7 text-xs"
            placeholder={hr.clientKeys.keyPlaceholder}
            value={newAliasKey}
            onChange={(e) => setNewAliasKey(e.target.value)}
          />
          <Button
            size="sm"
            className="h-7 shrink-0 px-2 text-xs"
            disabled={saving === "__new__" || !newAliasName.trim() || !newAliasKey.trim()}
            onClick={() => {
              setSaving("__new__");
              void addAlias().finally(() => setSaving(null));
            }}
          >
            {saving === "__new__" ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              hr.clientKeys.add
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
