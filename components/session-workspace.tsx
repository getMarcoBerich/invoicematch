"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Loader2, Pencil, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterPanel, defaultFilters, type FilterState } from "@/components/filter-panel";
import { MatchTable } from "@/components/match-table";
import { LinkDialog } from "@/components/link-dialog";
import { ClientKeysPanel } from "@/components/client-keys-panel";
import { RenameSessionDialog } from "@/components/rename-session-dialog";
import type { PayerKeyMap } from "@/lib/clients/payer-keys";
import {
  buildPayerKeyMapFromApi,
  collectClients,
  collectPayerKeys,
  countInvoices,
  countPayments,
  filterRecords,
  sumInvoiceTotals,
  sumPaymentAmounts,
  type TabView,
} from "@/lib/filters";
import { buildRecordsCsv, downloadCsvFile, recordsCsvFilename } from "@/lib/export/csv";
import { formatAmount, formatDateTime } from "@/lib/format";
import { hr } from "@/lib/i18n/hr";
import { runAutoMatch, unlinkMatch } from "@/lib/matching/engine";
import { getSessionClientKeys } from "@/lib/services/client-keys";
import { getSessionDisplayName, getSessionRecords } from "@/lib/services/session";
import type { RecordRow } from "@/lib/types";

type SessionData = {
  session: { id: string; filename: string; name: string; importedAt: string | Date };
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
};

type DialogState =
  | { mode: "link-invoice"; sourceId: string }
  | { mode: "link-payment"; sourceId: string }
  | { mode: "override"; record: RecordRow }
  | null;

const MATCH_UI_MIN_MS = 5000;

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function SessionWorkspace({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [tab, setTab] = useState<TabView>("all");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [matching, setMatching] = useState(false);
  const [payerKeyMap, setPayerKeyMap] = useState<PayerKeyMap>(new Map());
  const [renameOpen, setRenameOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [recordsData, keysData] = await Promise.all([
        getSessionRecords(sessionId),
        getSessionClientKeys(sessionId),
      ]);
      setData(recordsData);
      setPayerKeyMap(buildPayerKeyMapFromApi(keysData));
    } catch (err) {
      setError(err instanceof Error ? err.message : hr.workspace.loadFailed);
      setData(null);
      setPayerKeyMap(new Map());
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRunMatch = async () => {
    setMatching(true);
    const started = Date.now();
    try {
      await runAutoMatch(sessionId);
      const remaining = MATCH_UI_MIN_MS - (Date.now() - started);
      if (remaining > 0) await delay(remaining);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : hr.workspace.matchingFailed);
    } finally {
      setMatching(false);
    }
  };

  const handleUnlink = async (matchId: string) => {
    try {
      await unlinkMatch(sessionId, matchId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : hr.workspace.unlinkFailed);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="text-center">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" className="mt-4" onClick={load}>
          {hr.workspace.retry}
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const clients = collectClients(data.records);
  const payerKeys = collectPayerKeys(data.records, payerKeyMap);
  const filteredRecords = filterRecords(data.records, filters, tab, payerKeyMap);
  const filteredCount = filteredRecords.length;
  const visibleInvoiceTotal = sumInvoiceTotals(filteredRecords);
  const visiblePaymentTotal = sumPaymentAmounts(filteredRecords);
  const visibleInvoiceCount = countInvoices(filteredRecords);
  const visiblePaymentCount = countPayments(filteredRecords);

  const handleExportAll = () => {
    const csv = buildRecordsCsv(data.records);
    downloadCsvFile(csv, recordsCsvFilename(getSessionDisplayName(data.session), "all"));
  };

  const handleExportView = () => {
    const csv = buildRecordsCsv(filteredRecords);
    downloadCsvFile(csv, recordsCsvFilename(getSessionDisplayName(data.session), "view"));
  };

  const displayName = getSessionDisplayName(data.session);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/"
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-1.5 text-sm hover:bg-muted"
          >
            <ArrowLeft className="size-4" />
            {hr.workspace.back}
          </Link>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1">
              <h1 className="truncate text-lg font-semibold">{displayName}</h1>
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                onClick={() => setRenameOpen(true)}
                aria-label={hr.workspace.renameSession}
              >
                <Pencil className="size-3.5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {hr.workspace.sourceFile(data.session.filename)} · {hr.workspace.imported}{" "}
              {formatDateTime(data.session.importedAt)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Button
            size="lg"
            className="gap-2 px-4 font-semibold shadow-sm"
            onClick={handleRunMatch}
            disabled={matching}
          >
            {matching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {matching ? hr.workspace.matchingInProgress : hr.workspace.rerunMatch}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportAll}>
            <Download className="size-4" />
            {hr.workspace.exportCsvAll}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportView}>
            <Download className="size-4" />
            {hr.workspace.exportCsvView}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {[
          {
            label: hr.workspace.stats.totalInvoiced,
            value: formatAmount(visibleInvoiceTotal),
            sub: hr.workspace.stats.invoicesCount(visibleInvoiceCount),
          },
          {
            label: hr.workspace.stats.totalPaid,
            value: formatAmount(visiblePaymentTotal),
            sub: hr.workspace.stats.paymentsCount(visiblePaymentCount),
          },
        ].map((s) => (
          <Card key={s.label} size="sm" className="border-primary/20 bg-primary/5 py-0">
            <CardHeader className="pb-0 pt-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent className="pb-2 pt-1">
              <div className="text-2xl font-bold tabular-nums">{s.value}</div>
              <p className="text-xs text-muted-foreground">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1 sm:grid-cols-5">
        {[
          { label: hr.workspace.stats.invoices, value: data.stats.totalInvoices },
          { label: hr.workspace.stats.payments, value: data.stats.totalPayments },
          { label: hr.workspace.stats.matched, value: data.stats.matched },
          { label: hr.workspace.stats.unmatchedInvoices, value: data.stats.unmatchedInvoices },
          { label: hr.workspace.stats.unmatchedPayments, value: data.stats.unmatchedPayments },
        ].map((s) => (
          <Card key={s.label} size="sm" className="py-0">
            <CardHeader className="pb-0 pt-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent className="pb-2 pt-1 text-xl font-bold">{s.value}</CardContent>
          </Card>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-2 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-2">
          <div className="min-w-0 overflow-hidden rounded-md border p-2">
            <h2 className="mb-2 text-sm font-medium">{hr.workspace.filters}</h2>
            <FilterPanel
              filters={filters}
              clients={clients}
              payerKeys={payerKeys}
              onChange={setFilters}
            />
          </div>
          <div className="flex min-h-[calc(100vh-10rem)] min-w-0 flex-col overflow-hidden rounded-md border p-2">
            <ClientKeysPanel sessionId={sessionId} onKeysChanged={load} />
          </div>
        </aside>

        <div className="min-w-0">
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabView)}>
            <TabsList>
              <TabsTrigger value="all">{hr.workspace.tabs.all}</TabsTrigger>
              <TabsTrigger value="matched">{hr.workspace.tabs.matched}</TabsTrigger>
              <TabsTrigger value="unmatched-invoices">
                {hr.workspace.tabs.unmatchedInvoices}
              </TabsTrigger>
              <TabsTrigger value="unmatched-payments">
                {hr.workspace.tabs.unmatchedPayments}
              </TabsTrigger>
            </TabsList>
            <Separator className="my-1" />

            {(["all", "matched", "unmatched-invoices", "unmatched-payments"] as TabView[]).map(
              (t) => (
                <TabsContent key={t} value={t}>
                  <MatchTable
                    records={filterRecords(data.records, filters, t, payerKeyMap)}
                    tabView={t}
                    onLinkInvoice={(id) => setDialog({ mode: "link-invoice", sourceId: id })}
                    onLinkPayment={(id) => setDialog({ mode: "link-payment", sourceId: id })}
                    onUnlink={handleUnlink}
                    onOverride={(record) => setDialog({ mode: "override", record })}
                  />
                </TabsContent>
              ),
            )}
          </Tabs>

          <p className="mt-1 text-xs text-muted-foreground">
            {hr.workspace.showingRecords(filteredCount, data.records.length)}
          </p>
        </div>
      </div>

      <LinkDialog
        key={
          dialog
            ? `${dialog.mode}-${"sourceId" in dialog ? dialog.sourceId : dialog.record.matchId}`
            : "closed"
        }
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        sessionId={sessionId}
        mode={dialog?.mode ?? "link-invoice"}
        sourceId={
          dialog?.mode === "link-invoice"
            ? dialog.sourceId
            : dialog?.mode === "link-payment"
              ? dialog.sourceId
              : undefined
        }
        overrideRecord={dialog?.mode === "override" ? dialog.record : undefined}
        onComplete={load}
      />

      <RenameSessionDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        sessionId={sessionId}
        currentName={data.session.name}
        filename={data.session.filename}
        onRenamed={(name) => {
          setData((current) =>
            current ? { ...current, session: { ...current.session, name } } : current,
          );
        }}
      />
    </div>
  );
}
