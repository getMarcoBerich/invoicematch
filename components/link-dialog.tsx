"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatAmount, formatDate } from "@/lib/format";
import { hr } from "@/lib/i18n/hr";
import { cn } from "@/lib/utils";
import type { RecordRow } from "@/lib/types";
import {
  getRecordsForOverride,
  getUnmatchedForLinking,
} from "@/lib/services/session";
import { createManualMatch, overrideMatch } from "@/lib/matching/engine";

type UnmatchedInvoice = {
  id: string;
  invoiceNumber: string;
  total: number;
  client: string;
  invoiceDate: string;
};

type UnmatchedPayment = {
  id: string;
  amount: number;
  client: string;
  paymentDate: string;
  description: string;
};

type InvoiceSortField = "invoiceNumber" | "invoiceDate" | "total" | "client";
type PaymentSortField = "amount" | "paymentDate" | "client" | "description";
type SortDir = "asc" | "desc";

type LinkDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  mode: "link-invoice" | "link-payment" | "override";
  sourceId?: string;
  overrideRecord?: RecordRow;
  onComplete: () => void;
};

async function fetchDialogData(
  sessionId: string,
  mode: LinkDialogProps["mode"],
  sourceId?: string,
  overrideMatchId?: string,
) {
  if (mode === "link-invoice" && sourceId) {
    const { unmatchedPayments } = await getUnmatchedForLinking(sessionId);
    return {
      unmatchedInvoices: [] as UnmatchedInvoice[],
      unmatchedPayments: unmatchedPayments.map((p) => ({
        id: p.id,
        amount: p.amount,
        client: p.client,
        paymentDate: p.paymentDate,
        description: p.description,
      })),
    };
  }
  if (mode === "link-payment" && sourceId) {
    const { unmatchedInvoices } = await getUnmatchedForLinking(sessionId);
    return {
      unmatchedInvoices: unmatchedInvoices.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        total: i.total,
        client: i.client,
        invoiceDate: i.invoiceDate,
      })),
      unmatchedPayments: [] as UnmatchedPayment[],
    };
  }
  if (mode === "override" && overrideMatchId) {
    const { availableInvoices, availablePayments } = await getRecordsForOverride(
      sessionId,
      overrideMatchId,
    );
    return {
      unmatchedInvoices: availableInvoices.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        total: i.total,
        client: i.client,
        invoiceDate: i.invoiceDate,
      })),
      unmatchedPayments: availablePayments.map((p) => ({
        id: p.id,
        amount: p.amount,
        client: p.client,
        paymentDate: p.paymentDate,
        description: p.description,
      })),
    };
  }
  return { unmatchedInvoices: [], unmatchedPayments: [] };
}

function sortInvoices(
  items: UnmatchedInvoice[],
  field: InvoiceSortField,
  dir: SortDir,
): UnmatchedInvoice[] {
  return [...items].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case "invoiceNumber":
        cmp = a.invoiceNumber.localeCompare(b.invoiceNumber, "hr");
        break;
      case "invoiceDate":
        cmp = a.invoiceDate.localeCompare(b.invoiceDate);
        break;
      case "total":
        cmp = a.total - b.total;
        break;
      case "client":
        cmp = a.client.localeCompare(b.client, "hr");
        break;
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

function sortPayments(
  items: UnmatchedPayment[],
  field: PaymentSortField,
  dir: SortDir,
): UnmatchedPayment[] {
  return [...items].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case "amount":
        cmp = a.amount - b.amount;
        break;
      case "paymentDate":
        cmp = a.paymentDate.localeCompare(b.paymentDate);
        break;
      case "client":
        cmp = a.client.localeCompare(b.client, "hr");
        break;
      case "description":
        cmp = a.description.localeCompare(b.description, "hr");
        break;
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

function filterByQuery(values: (string | number | null | undefined)[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = values
    .filter((v) => v !== null && v !== undefined)
    .map((v) => String(v).toLowerCase())
    .join(" ");
  return haystack.includes(q);
}

function filterInvoices(items: UnmatchedInvoice[], query: string): UnmatchedInvoice[] {
  if (!query.trim()) return items;
  return items.filter((inv) =>
    filterByQuery(
      [inv.invoiceNumber, inv.invoiceDate, inv.client, inv.total, formatAmount(inv.total)],
      query,
    ),
  );
}

function filterPayments(items: UnmatchedPayment[], query: string): UnmatchedPayment[] {
  if (!query.trim()) return items;
  return items.filter((pay) =>
    filterByQuery(
      [
        pay.amount,
        Math.abs(pay.amount),
        pay.paymentDate,
        pay.client,
        pay.description,
        formatAmount(pay.amount),
      ],
      query,
    ),
  );
}

function PickerSearch({
  value,
  onChange,
  placeholder,
  shown,
  total,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  shown: number;
  total: number;
}) {
  return (
    <div className="mb-2 space-y-1">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8"
      />
      {value.trim() ? (
        <p className="text-xs text-muted-foreground">
          {hr.dialog.showingResults(shown, total)}
        </p>
      ) : null}
    </div>
  );
}
function SortButton({
  label,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-0.5 font-medium hover:text-foreground",
        active ? "text-foreground" : "text-muted-foreground",
        className,
      )}
    >
      {label}
      {active ? (
        dir === "asc" ? (
          <ChevronUp className="size-3.5 shrink-0" />
        ) : (
          <ChevronDown className="size-3.5 shrink-0" />
        )
      ) : null}
    </button>
  );
}

function InvoicePicker({
  invoices,
  selectedId,
  onSelect,
}: {
  invoices: UnmatchedInvoice[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [sortField, setSortField] = useState<InvoiceSortField>("invoiceDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => filterInvoices(invoices, search), [invoices, search]);
  const sorted = useMemo(
    () => sortInvoices(filtered, sortField, sortDir),
    [filtered, sortField, sortDir],
  );

  const toggleSort = (field: InvoiceSortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  return (
    <div className="flex min-h-0 flex-col">
      <PickerSearch
        value={search}
        onChange={setSearch}
        placeholder={hr.filter.searchPlaceholder}
        shown={sorted.length}
        total={invoices.length}
      />
      <div className="overflow-x-auto rounded-t border border-b-0 bg-muted/40 px-2 py-2">
        <div className="grid min-w-[640px] grid-cols-[minmax(7rem,1fr)_minmax(6rem,0.7fr)_minmax(5rem,0.5fr)_minmax(10rem,1.5fr)] gap-2 text-xs">
          <SortButton
            label={hr.table.invoiceNumber}
            active={sortField === "invoiceNumber"}
            dir={sortDir}
            onClick={() => toggleSort("invoiceNumber")}
          />
          <SortButton
            label={hr.table.invoiceDate}
            active={sortField === "invoiceDate"}
            dir={sortDir}
            onClick={() => toggleSort("invoiceDate")}
          />
          <SortButton
            label={hr.table.total}
            active={sortField === "total"}
            dir={sortDir}
            onClick={() => toggleSort("total")}
            className="justify-end"
          />
          <SortButton
            label={hr.table.invoiceClient}
            active={sortField === "client"}
            dir={sortDir}
            onClick={() => toggleSort("client")}
          />
        </div>
      </div>
      <div className="link-dialog-scroll max-h-72 overflow-y-scroll rounded-b border">
        {sorted.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {hr.dialog.noSearchResults}
          </p>
        ) : (
          sorted.map((inv) => (
            <button
              key={inv.id}
              type="button"
              onClick={() => onSelect(inv.id)}
              className={cn(
                "grid w-full min-w-[640px] grid-cols-[minmax(7rem,1fr)_minmax(6rem,0.7fr)_minmax(5rem,0.5fr)_minmax(10rem,1.5fr)] gap-2 border-b px-2 py-2 text-left text-sm last:border-b-0",
                selectedId === inv.id ? "bg-primary/10" : "hover:bg-muted/60",
              )}
            >
              <span className="truncate font-mono">{inv.invoiceNumber}</span>
              <span>{formatDate(inv.invoiceDate)}</span>
              <span className="text-right font-medium">{formatAmount(inv.total)}</span>
              <span className="truncate text-muted-foreground">{inv.client}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function PaymentPicker({
  payments,
  selectedId,
  onSelect,
}: {
  payments: UnmatchedPayment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [sortField, setSortField] = useState<PaymentSortField>("paymentDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => filterPayments(payments, search), [payments, search]);
  const sorted = useMemo(
    () => sortPayments(filtered, sortField, sortDir),
    [filtered, sortField, sortDir],
  );

  const toggleSort = (field: PaymentSortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  return (
    <div className="flex min-h-0 flex-col">
      <PickerSearch
        value={search}
        onChange={setSearch}
        placeholder={hr.filter.searchPlaceholder}
        shown={sorted.length}
        total={payments.length}
      />
      <div className="overflow-x-auto rounded-t border border-b-0 bg-muted/40 px-2 py-2">
        <div className="grid min-w-[720px] grid-cols-[minmax(5rem,0.5fr)_minmax(6rem,0.7fr)_minmax(10rem,1.2fr)_minmax(12rem,1.6fr)] gap-2 text-xs">
          <SortButton
            label={hr.table.amount}
            active={sortField === "amount"}
            dir={sortDir}
            onClick={() => toggleSort("amount")}
          />
          <SortButton
            label={hr.table.paymentDate}
            active={sortField === "paymentDate"}
            dir={sortDir}
            onClick={() => toggleSort("paymentDate")}
          />
          <SortButton
            label={hr.table.invoiceClient}
            active={sortField === "client"}
            dir={sortDir}
            onClick={() => toggleSort("client")}
          />
          <SortButton
            label={hr.table.paymentDescription}
            active={sortField === "description"}
            dir={sortDir}
            onClick={() => toggleSort("description")}
          />
        </div>
      </div>
      <div className="link-dialog-scroll max-h-72 overflow-y-scroll rounded-b border">
        {sorted.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {hr.dialog.noSearchResults}
          </p>
        ) : (
          sorted.map((pay) => (
            <button
              key={pay.id}
              type="button"
              onClick={() => onSelect(pay.id)}
              className={cn(
                "grid w-full min-w-[720px] grid-cols-[minmax(5rem,0.5fr)_minmax(6rem,0.7fr)_minmax(10rem,1.2fr)_minmax(12rem,1.6fr)] gap-2 border-b px-2 py-2 text-left text-sm last:border-b-0",
                selectedId === pay.id ? "bg-primary/10" : "hover:bg-muted/60",
              )}
            >
              <span className="font-medium">{formatAmount(pay.amount)}</span>
              <span>{formatDate(pay.paymentDate)}</span>
              <span className="truncate text-muted-foreground">{pay.client}</span>
              <span className="truncate text-muted-foreground">{pay.description}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export function LinkDialog({
  open,
  onOpenChange,
  sessionId,
  mode,
  sourceId,
  overrideRecord,
  onComplete,
}: LinkDialogProps) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [unmatchedInvoices, setUnmatchedInvoices] = useState<UnmatchedInvoice[]>([]);
  const [unmatchedPayments, setUnmatchedPayments] = useState<UnmatchedPayment[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const dialogKey = `${mode}-${sourceId ?? ""}-${overrideRecord?.matchId ?? ""}`;

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    void (async () => {
      setLoading(true);
      setLoadError(null);
      setSubmitError(null);
      setSelectedInvoiceId(
        mode === "link-invoice" ? (sourceId ?? null) : (overrideRecord?.invoice?.id ?? null),
      );
      setSelectedPaymentId(
        mode === "link-payment" ? (sourceId ?? null) : (overrideRecord?.payment?.id ?? null),
      );

      try {
        const data = await fetchDialogData(
          sessionId,
          mode,
          sourceId,
          overrideRecord?.matchId ?? undefined,
        );
        if (cancelled) return;
        setUnmatchedInvoices(data.unmatchedInvoices);
        setUnmatchedPayments(data.unmatchedPayments);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : hr.dialog.loadFailed);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, dialogKey, sessionId, mode, sourceId, overrideRecord]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);

    try {
      if (mode === "override" && overrideRecord?.matchId) {
        if (!selectedInvoiceId || !selectedPaymentId) {
          throw new Error(hr.dialog.selectBoth);
        }
        await overrideMatch(
          sessionId,
          overrideRecord.matchId,
          selectedInvoiceId,
          selectedPaymentId,
        );
      } else {
        const invoiceId = mode === "link-invoice" ? sourceId : selectedInvoiceId;
        const paymentId = mode === "link-payment" ? sourceId : selectedPaymentId;

        if (!invoiceId || !paymentId) throw new Error(hr.dialog.selectCandidate);

        await createManualMatch(sessionId, invoiceId, paymentId);
      }

      onComplete();
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : hr.dialog.operationFailed);
    } finally {
      setSubmitting(false);
    }
  };

  const title =
    mode === "override"
      ? hr.dialog.overrideTitle
      : mode === "link-invoice"
        ? hr.dialog.linkInvoiceTitle
        : hr.dialog.linkPaymentTitle;

  const showInvoices = mode === "link-payment" || mode === "override";
  const showPayments = mode === "link-invoice" || mode === "override";

  const listEmpty =
    (showInvoices && unmatchedInvoices.length === 0 && !loading) ||
    (showPayments && unmatchedPayments.length === 0 && !loading && mode !== "override") ||
    (mode === "override" &&
      unmatchedInvoices.length === 0 &&
      unmatchedPayments.length === 0 &&
      !loading);

  const canSubmit =
    mode === "override"
      ? Boolean(selectedInvoiceId && selectedPaymentId)
      : mode === "link-invoice"
        ? Boolean(selectedPaymentId)
        : Boolean(selectedInvoiceId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[90vh] max-w-none flex-col overflow-hidden sm:max-w-none",
          mode === "override"
            ? "w-[min(100.8rem,calc(100%-2rem))]"
            : "w-[min(56rem,calc(100%-2rem))]",
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === "override" ? hr.dialog.overrideDesc : hr.dialog.linkSelectDesc}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : listEmpty ? (
            <p className="text-sm text-muted-foreground">
              {mode === "link-invoice"
                ? hr.dialog.noUnmatchedPayments
                : hr.dialog.noUnmatchedInvoices}
            </p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
              {submitError ? (
                <p className="shrink-0 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {submitError}
                </p>
              ) : null}
              <div
                className={cn(
                  "min-h-0 flex-1 gap-4 overflow-hidden",
                  mode === "override" ? "grid lg:grid-cols-2" : "flex flex-col",
                )}
              >
              {showInvoices && (
                <div className="min-w-0">
                  <p className="mb-2 text-sm font-medium">{hr.dialog.invoice}</p>
                  <div className="overflow-x-auto">
                    <InvoicePicker
                      invoices={unmatchedInvoices}
                      selectedId={selectedInvoiceId}
                      onSelect={setSelectedInvoiceId}
                    />
                  </div>
                </div>
              )}

              {showPayments && (
                <div className="min-w-0">
                  <p className="mb-2 text-sm font-medium">{hr.dialog.payment}</p>
                  <div className="overflow-x-auto">
                    <PaymentPicker
                      payments={unmatchedPayments}
                      selectedId={selectedPaymentId}
                      onSelect={setSelectedPaymentId}
                    />
                  </div>
                </div>
              )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {hr.dialog.cancel}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || loading || !canSubmit}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : hr.dialog.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
