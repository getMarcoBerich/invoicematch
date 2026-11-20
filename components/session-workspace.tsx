"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, FileSpreadsheet, GitMerge, Loader2, Pencil, RefreshCw, Trash2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterPanel, defaultFilters, type FilterState } from "@/components/filter-panel";
import { LedgerPanel } from "@/components/ledger-panel";
import { CloseCallsPanel } from "@/components/close-calls-panel";
import { OpenItemsPanel } from "@/components/open-items-panel";
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
import { downloadLedgerWorkbook, downloadOpenItemsWorkbook, ledgerXlsxFilename, openItemsXlsxFilename } from "@/lib/export/ledger-xlsx";
import {
  buildSessionBundle,
  downloadJsonFile,
  sessionBundleFilename,
} from "@/lib/services/session-bundle";
import { formatAmount, formatDateTime } from "@/lib/format";
import { hr } from "@/lib/i18n/hr";
import { buildClientLedgers, buildOpenItems, ledgerTotals } from "@/lib/ledger";
import { closeCallsFromRecords } from "@/lib/matching/close-calls";
import { runAutoMatch, unlinkAllMatches, unlinkMatch, createManualMatch } from "@/lib/matching/engine";
import { getSessionClientKeys } from "@/lib/services/client-keys";
import {
  deleteSession,
  getSessionDisplayName,
  getSessionRecords,
  listSessionSummaries,
  mergeSessions,
} from "@/lib/services/session";
import { applySessionUpdate, previewSessionUpdate, type SessionUpdatePreview } from "@/lib/services/session-update";
import type { RecordRow } from "@/lib/types";
import { cn } from "@/lib/utils";

type SessionData = {
  session: {
    id: string;
    filename: string;
    name: string;
    importedAt: string | Date;
    updatedAt?: string | Date;
  };
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
  const router = useRouter();
  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [tab, setTab] = useState<TabView>("all");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [matching, setMatching] = useState(false);
  const [unlinkingAll, setUnlinkingAll] = useState(false);
  const [unlinkAllOpen, setUnlinkAllOpen] = useState(false);
  const [unlinkIds, setUnlinkIds] = useState<string[]>([]);
  const [matchActivated, setMatchActivated] = useState(false);
  const [matchWarningOpen, setMatchWarningOpen] = useState(false);
  const [payerKeyMap, setPayerKeyMap] = useState<PayerKeyMap>(new Map());
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingSession, setDeletingSession] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSources, setMergeSources] = useState<{ id: string; name: string; filename: string }[]>([]);
  const [mergeFromId, setMergeFromId] = useState("");
  const [merging, setMerging] = useState(false);
  const [suggestionsHost, setSuggestionsHost] = useState<HTMLDivElement | null>(null);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updatePreview, setUpdatePreview] = useState<SessionUpdatePreview | null>(null);
  const [updating, setUpdating] = useState(false);
  const updateFileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
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

  useEffect(() => {
    if (data && data.stats.matched > 0) {
      setMatchActivated(true);
    }
  }, [data]);

  const handleRunMatch = async () => {
    setMatchWarningOpen(false);
    setMatchActivated(true);
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

  const handleUpdateFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError(hr.api.excelOnly);
      return;
    }
    setUpdating(true);
    setError(null);
    try {
      const preview = await previewSessionUpdate(sessionId, file.name, await file.arrayBuffer());
      setUpdatePreview(preview);
      setUpdateOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : hr.workspace.updateExcelFailed);
    } finally {
      setUpdating(false);
      if (updateFileRef.current) updateFileRef.current.value = "";
    }
  };

  const handleApplyUpdate = async () => {
    if (!updatePreview) return;
    setUpdating(true);
    try {
      await applySessionUpdate(updatePreview);
      setUpdateOpen(false);
      setUpdatePreview(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : hr.workspace.updateExcelFailed);
    } finally {
      setUpdating(false);
    }
  };

  const handleConnectCloseCall = async (invoiceId: string, paymentId: string) => {
    try {
      await createManualMatch(sessionId, invoiceId, paymentId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : hr.api.linkFailed);
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

  const handleUnlinkAll = async () => {
    setUnlinkingAll(true);
    try {
      await unlinkAllMatches(sessionId, unlinkIds);
      setUnlinkAllOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : hr.workspace.unlinkFailed);
    } finally {
      setUnlinkingAll(false);
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
  const ledgers = buildClientLedgers(data.records, filters, payerKeyMap);
  const openItems = buildOpenItems(ledgers);
  const closeCalls = closeCallsFromRecords(data.records, payerKeyMap);
  const ledgerSummary = ledgerTotals(ledgers);
  const onAccountCards = tab === "konto-kartice";
  const onOpenItems = tab === "otvorene-stavke";
  const filteredRecords = filterRecords(data.records, filters, tab, payerKeyMap);
  const filteredCount = filteredRecords.length;
  const visibleInvoiceTotal = onOpenItems
    ? openItems.reduce((sum, item) => sum + item.openAmount, 0)
    : onAccountCards
      ? ledgerSummary.invoiced
      : sumInvoiceTotals(filteredRecords);
  const visiblePaymentTotal = onOpenItems
    ? 0
    : onAccountCards
      ? ledgerSummary.paid
      : sumPaymentAmounts(filteredRecords);
  const visibleInvoiceCount = onOpenItems
    ? openItems.length
    : onAccountCards
      ? ledgerSummary.invoiceCount
      : countInvoices(filteredRecords);
  const visiblePaymentCount = onAccountCards
    ? ledgerSummary.paymentCount
    : countPayments(filteredRecords);
  const visibleMatchIds = onAccountCards
    ? matchIdsForDocuments(
        data.records,
        new Set(ledgers.flatMap((ledger) => ledger.lines.map((line) => line.id))),
      )
    : onOpenItems
      ? matchIdsForDocuments(data.records, new Set(openItems.map((item) => item.id)))
      : matchIdsInRecords(filteredRecords);

  const handleExportAll = () => {
    const csv = buildRecordsCsv(data.records);
    downloadCsvFile(csv, recordsCsvFilename(getSessionDisplayName(data.session), "all"));
  };

  const handleExportView = () => {
    const sessionName = getSessionDisplayName(data.session);
    if (onOpenItems) {
      void downloadOpenItemsWorkbook(openItems, openItemsXlsxFilename(sessionName)).catch((err) => {
        setError(err instanceof Error ? err.message : hr.api.exportFailed);
      });
      return;
    }
    if (onAccountCards) {
      void downloadLedgerWorkbook(ledgers, ledgerXlsxFilename(sessionName)).catch((err) => {
        setError(err instanceof Error ? err.message : hr.api.exportFailed);
      });
      return;
    }
    const csv = buildRecordsCsv(filteredRecords);
    downloadCsvFile(csv, recordsCsvFilename(getSessionDisplayName(data.session), "view"));
  };

  const handleExportSession = () => {
    const sessionName = getSessionDisplayName(data.session);
    void buildSessionBundle([sessionId])
      .then((bundle) => downloadJsonFile(bundle, sessionBundleFilename(sessionName)))
      .catch((err) => {
        setError(err instanceof Error ? err.message : hr.api.exportFailed);
      });
  };

  const displayName = getSessionDisplayName(data.session);
  const compactMatchButton = matchActivated || matching;

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
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
                aria-label={hr.upload.deleteSession}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {hr.workspace.sourceFile(data.session.filename)} · {hr.workspace.imported}{" "}
              {formatDateTime(data.session.importedAt)}
              {data.session.updatedAt
                ? ` · ${hr.workspace.updated} ${formatDateTime(data.session.updatedAt)}`
                : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Button
            size={compactMatchButton ? "sm" : "lg"}
            className={cn(
              "h-auto gap-2 font-semibold transition-all",
              compactMatchButton
                ? "px-3 py-2 text-sm shadow-sm"
                : "gap-2.5 px-8 py-4 text-base font-bold shadow-md sm:px-10 sm:py-5 sm:text-lg",
            )}
            onClick={() => setMatchWarningOpen(true)}
            disabled={matching || unlinkingAll}
          >
            {matching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className={compactMatchButton ? "size-4" : "size-5"} />
            )}
            {matching ? hr.workspace.matchingInProgress : hr.workspace.rerunMatch}
          </Button>
          <Button
            variant="outline"
            size={compactMatchButton ? "sm" : "lg"}
            className={cn(compactMatchButton ? "" : "px-6 py-4 text-base sm:px-8 sm:py-5 sm:text-lg")}
            onClick={() => {
              setUnlinkIds(visibleMatchIds);
              setUnlinkAllOpen(true);
            }}
            disabled={matching || unlinkingAll || visibleMatchIds.length === 0}
          >
            {unlinkingAll ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Unlink className={compactMatchButton ? "size-4" : "size-5"} />
            )}
            {unlinkingAll ? hr.workspace.unlinkingAll : hr.workspace.unlinkAll}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={matching || unlinkingAll || updating || merging}
            onClick={() => {
              void listSessionSummaries()
                .then((sessions) => {
                  const others = sessions.filter((session) => session.id !== sessionId);
                  setMergeSources(others);
                  setMergeFromId(others[0]?.id ?? "");
                  setMergeOpen(true);
                })
                .catch((err) => {
                  setError(err instanceof Error ? err.message : hr.upload.mergeSessionFailed);
                });
            }}
          >
            <GitMerge className="size-4" />
            {hr.upload.mergeSession}
          </Button>
          <input
            ref={updateFileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleUpdateFile(file);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={matching || unlinkingAll || updating}
            onClick={() => updateFileRef.current?.click()}
          >
            {updating ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
            {updating ? hr.workspace.updateExcelBusy : hr.workspace.updateExcel}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportAll}>
            <Download className="size-4" />
            {hr.workspace.exportCsvAll}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportSession}>
            <Download className="size-4" />
            {hr.workspace.exportSession}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportView}
            disabled={(onAccountCards && ledgers.length === 0) || (onOpenItems && openItems.length === 0)}
          >
            <Download className="size-4" />
            {onAccountCards || onOpenItems ? hr.workspace.exportExcel : hr.workspace.exportCsvView}
          </Button>
        </div>
      </div>

      <div ref={setSuggestionsHost} className="empty:hidden" />

      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {[
          {
            label: onOpenItems ? hr.ledger.openAmount : hr.workspace.stats.totalInvoiced,
            value: formatAmount(visibleInvoiceTotal),
            sub: hr.workspace.stats.invoicesCount(visibleInvoiceCount),
          },
          {
            label: onOpenItems ? hr.ledger.daysOpen : hr.workspace.stats.totalPaid,
            value: onOpenItems
              ? String(openItems[0]?.daysOpen ?? 0)
              : formatAmount(visiblePaymentTotal),
            sub: onOpenItems
              ? (openItems[0]?.client ?? "—")
              : hr.workspace.stats.paymentsCount(visiblePaymentCount),
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
            <ClientKeysPanel
              sessionId={sessionId}
              onKeysChanged={load}
              suggestionsHost={suggestionsHost}
            />
          </div>
        </aside>

        <div className="min-w-0 space-y-2">
          <CloseCallsPanel calls={closeCalls} onConnect={handleConnectCloseCall} />
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabView)}>
            <TabsList className="h-auto flex-wrap group-data-horizontal/tabs:h-auto">
              <TabsTrigger value="all">{hr.workspace.tabs.all}</TabsTrigger>
              <TabsTrigger value="matched">{hr.workspace.tabs.matched}</TabsTrigger>
              <TabsTrigger value="unmatched-invoices">
                {hr.workspace.tabs.unmatchedInvoices}
              </TabsTrigger>
              <TabsTrigger value="unmatched-payments">
                {hr.workspace.tabs.unmatchedPayments}
              </TabsTrigger>
              <TabsTrigger value="konto-kartice">{hr.workspace.tabs.accountCards}</TabsTrigger>
              <TabsTrigger value="otvorene-stavke">{hr.workspace.tabs.openItems}</TabsTrigger>
            </TabsList>
            <Separator className="my-1" />

            {(["all", "matched", "unmatched-invoices", "unmatched-payments"] as const).map(
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
            <TabsContent value="otvorene-stavke">
              <OpenItemsPanel
                items={openItems}
                onLinkInvoice={(id) => setDialog({ mode: "link-invoice", sourceId: id })}
              />
            </TabsContent>
            <TabsContent value="konto-kartice">
              <LedgerPanel
                ledgers={ledgers}
                sessionName={displayName}
                onExportError={(message) => setError(message)}
                onLinkInvoice={(id) => setDialog({ mode: "link-invoice", sourceId: id })}
                onLinkPayment={(id) => setDialog({ mode: "link-payment", sourceId: id })}
              />
            </TabsContent>
          </Tabs>

          <p className="mt-1 text-xs text-muted-foreground">
            {onAccountCards
              ? hr.workspace.showingClients(ledgers.length)
              : hr.workspace.showingRecords(filteredCount, data.records.length)}
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

      <Dialog open={mergeOpen} onOpenChange={(open) => !merging && setMergeOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{hr.upload.mergeSessionTitle}</DialogTitle>
            <DialogDescription>
              {mergeSources.length === 0
                ? hr.upload.mergeSessionEmpty
                : hr.upload.mergeSessionDescription(
                    displayName,
                    getSessionDisplayName(
                      mergeSources.find((session) => session.id === mergeFromId) ?? {
                        name: "",
                        filename: "",
                      },
                    ),
                  )}
            </DialogDescription>
          </DialogHeader>
          {mergeSources.length > 0 ? (
            <div className="space-y-2">
              <Label>{hr.upload.mergeSessionPick}</Label>
              <select
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={mergeFromId}
                onChange={(event) => setMergeFromId(event.target.value)}
              >
                {mergeSources.map((session) => (
                  <option key={session.id} value={session.id}>
                    {getSessionDisplayName(session)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" disabled={merging} onClick={() => setMergeOpen(false)}>
              {hr.upload.deleteAllSessionsCancel}
            </Button>
            <Button
              disabled={merging || !mergeFromId}
              onClick={() => {
                setMerging(true);
                void mergeSessions(sessionId, mergeFromId)
                  .then(async () => {
                    setMergeOpen(false);
                    await load();
                  })
                  .catch((err) => {
                    setError(err instanceof Error ? err.message : hr.upload.mergeSessionFailed);
                  })
                  .finally(() => setMerging(false));
              }}
            >
              {merging ? hr.upload.mergeSessionBusy : hr.upload.mergeSessionConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={(open) => !deletingSession && setDeleteOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{hr.upload.deleteSessionConfirmTitle}</DialogTitle>
            <DialogDescription>
              {hr.upload.deleteSessionConfirmDescription(displayName)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={deletingSession} onClick={() => setDeleteOpen(false)}>
              {hr.upload.deleteAllSessionsCancel}
            </Button>
            <Button
              variant="destructive"
              disabled={deletingSession}
              onClick={() => {
                setDeletingSession(true);
                void deleteSession(sessionId)
                  .then(() => router.push("/"))
                  .catch((err) => {
                    setError(err instanceof Error ? err.message : hr.upload.deleteSessionFailed);
                    setDeletingSession(false);
                  });
              }}
            >
              {deletingSession ? hr.upload.deletingSessions : hr.upload.deleteSessionConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <Dialog open={matchWarningOpen} onOpenChange={setMatchWarningOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{hr.workspace.matchWarningTitle}</DialogTitle>
            <DialogDescription>{hr.workspace.matchWarningDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMatchWarningOpen(false)}>
              {hr.dialog.cancel}
            </Button>
            <Button onClick={() => void handleRunMatch()} disabled={matching}>
              {hr.workspace.matchWarningConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={updateOpen}
        onOpenChange={(open) => {
          if (updating) return;
          setUpdateOpen(open);
          if (!open) setUpdatePreview(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{hr.workspace.updateExcelTitle}</DialogTitle>
            <DialogDescription>
              {updatePreview ? hr.workspace.updateExcelDescription(updatePreview.filename) : null}
            </DialogDescription>
          </DialogHeader>
          {updatePreview ? (
            <ul className="space-y-1 text-sm">
              <li>{hr.workspace.updateExcelAddedInvoices(updatePreview.counts.addedInvoices)}</li>
              <li>{hr.workspace.updateExcelAddedPayments(updatePreview.counts.addedPayments)}</li>
              <li>{hr.workspace.updateExcelChangedInvoices(updatePreview.counts.updatedInvoices)}</li>
            </ul>
          ) : null}
          {updatePreview && updatePreview.warnings.length > 0 ? (
            <p className="text-sm text-muted-foreground">{updatePreview.warnings.slice(0, 3).join(" ")}</p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" disabled={updating} onClick={() => setUpdateOpen(false)}>
              {hr.dialog.cancel}
            </Button>
            <Button disabled={updating || !updatePreview} onClick={() => void handleApplyUpdate()}>
              {updating ? hr.workspace.updateExcelBusy : hr.workspace.updateExcelConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={unlinkAllOpen} onOpenChange={(open) => !unlinkingAll && setUnlinkAllOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {unlinkIds.length === data.stats.matched
                ? hr.workspace.unlinkAllTitle
                : hr.workspace.unlinkVisibleTitle}
            </DialogTitle>
            <DialogDescription>
              {hr.workspace.unlinkAllDescription(unlinkIds.length, data.stats.matched)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={unlinkingAll} onClick={() => setUnlinkAllOpen(false)}>
              {hr.dialog.cancel}
            </Button>
            <Button variant="destructive" disabled={unlinkingAll} onClick={() => void handleUnlinkAll()}>
              {unlinkingAll ? hr.workspace.unlinkingAll : hr.workspace.unlinkAllConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function matchIdsInRecords(records: RecordRow[]): string[] {
  return [...new Set(records.flatMap((record) => (record.matchId ? [record.matchId] : [])))];
}

function matchIdsForDocuments(records: RecordRow[], documentIds: Set<string>): string[] {
  return [
    ...new Set(
      records.flatMap((record) => {
        if (!record.matchId) return [];
        const shown =
          (record.invoice !== null && documentIds.has(record.invoice.id)) ||
          (record.payment !== null && documentIds.has(record.payment.id));
        return shown ? [record.matchId] : [];
      }),
    ),
  ];
}
