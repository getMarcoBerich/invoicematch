"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Link2, Unlink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAmount, formatDate } from "@/lib/format";
import type { TabView } from "@/lib/filters";
import { hr } from "@/lib/i18n/hr";
import type { RecordRow } from "@/lib/services/session";
import type { MatchReason } from "@/lib/types";

type MatchTableProps = {
  records: RecordRow[];
  tabView?: TabView;
  onLinkInvoice?: (invoiceId: string) => void;
  onLinkPayment?: (paymentId: string) => void;
  onUnlink?: (matchId: string) => void;
  onOverride?: (record: RecordRow) => void;
};

function sumInvoiceTotals(records: RecordRow[]) {
  return records.reduce((sum, r) => sum + (r.invoice?.total ?? 0), 0);
}

function sumPaymentAmounts(records: RecordRow[]) {
  return records.reduce((sum, r) => sum + Math.abs(r.payment?.amount ?? 0), 0);
}

function showTableTotals(tabView: TabView | undefined) {
  return (
    tabView === "matched" ||
    tabView === "unmatched-invoices" ||
    tabView === "unmatched-payments"
  );
}

function showSectionDivider(tabView: TabView | undefined) {
  return tabView === "all" || tabView === "matched";
}

const PAYMENT_DIVIDER = "border-l-2 border-border";

function StatusBadge({ status }: { status: RecordRow["matchStatus"] }) {
  const variants: Record<
    RecordRow["matchStatus"],
    { label: string; className: string }
  > = {
    auto: {
      label: hr.table.statusAuto,
      className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
    },
    manual: {
      label: hr.table.statusManual,
      className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
    },
    overridden: {
      label: hr.table.statusOverridden,
      className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    },
    unmatched: {
      label: hr.table.statusUnmatched,
      className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
    },
  };
  const v = variants[status];
  return <Badge className={v.className}>{v.label}</Badge>;
}

function signalLabel(signal: string): string {
  const labels = hr.table.signals as Record<string, string>;
  return labels[signal] ?? signal;
}

function MatchReasons({ reasons }: { reasons: MatchReason[] }) {
  const [open, setOpen] = useState(false);
  if (!reasons.length) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {hr.table.whyMatched}
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          {reasons.map((r) => (
            <li key={r.signal}>
              <span className="font-medium">{signalLabel(r.signal)}</span>: {r.detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MatchTable({
  records,
  tabView,
  onLinkInvoice,
  onLinkPayment,
  onUnlink,
  onOverride,
}: MatchTableProps) {
  if (records.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
        {hr.table.noRecords}
      </div>
    );
  }

  const invoiceTotal = sumInvoiceTotals(records);
  const paymentTotal = sumPaymentAmounts(records);
  const showTotals = showTableTotals(tabView);
  const showDivider = showSectionDivider(tabView);
  const showInvoiceTotal =
    tabView === "matched" || tabView === "unmatched-invoices";
  const showPaymentTotal =
    tabView === "matched" || tabView === "unmatched-payments";

  return (
    <div className="rounded-md border [&_[data-slot=table-cell]]:align-middle [&_[data-slot=table-cell]]:px-1.5 [&_[data-slot=table-cell]]:py-1.5 [&_[data-slot=table-head]]:h-8 [&_[data-slot=table-head]]:align-middle [&_[data-slot=table-head]]:px-1.5">
      <Table>
        <TableHeader>
          {showDivider && (
            <TableRow className="border-b-0 hover:bg-transparent">
              <TableHead className="h-7 bg-background" />
              <TableHead
                colSpan={4}
                className="h-7 bg-sky-500/10 text-center text-[11px] font-semibold uppercase tracking-wide text-sky-900 dark:text-sky-100"
              >
                {hr.table.sectionInvoices}
              </TableHead>
              <TableHead
                colSpan={4}
                className={`h-7 bg-amber-500/10 text-center text-[11px] font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-100 ${PAYMENT_DIVIDER}`}
              >
                {hr.table.sectionPayments}
              </TableHead>
              <TableHead className="sticky right-0 h-7 bg-background shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]" />
            </TableRow>
          )}
          <TableRow>
            <TableHead
              className={`min-w-[7.5rem] whitespace-normal ${showDivider ? "bg-background" : ""}`}
            >
              {hr.table.status}
            </TableHead>
            <TableHead className={`min-w-[6rem] ${showDivider ? "bg-sky-500/5" : ""}`}>
              {hr.table.invoiceNumber}
            </TableHead>
            <TableHead className={`min-w-[6rem] ${showDivider ? "bg-sky-500/5" : ""}`}>
              {hr.table.invoiceDate}
            </TableHead>
            <TableHead
              className={`min-w-[12rem] whitespace-normal ${showDivider ? "bg-sky-500/5" : ""}`}
            >
              {hr.table.invoiceClient}
            </TableHead>
            <TableHead
              className={`min-w-[5.5rem] text-right align-middle ${showDivider ? "bg-sky-500/5" : ""}`}
            >
              {hr.table.total}
            </TableHead>
            <TableHead
              className={`min-w-[6rem] ${showDivider ? `bg-amber-500/5 ${PAYMENT_DIVIDER}` : ""}`}
            >
              {hr.table.paymentDate}
            </TableHead>
            <TableHead className={`min-w-[12rem] whitespace-normal ${showDivider ? "bg-amber-500/5" : ""}`}>
              {hr.table.paymentClient}
            </TableHead>
            <TableHead
              className={`min-w-[5.5rem] text-right align-middle ${showDivider ? "bg-amber-500/5" : ""}`}
            >
              {hr.table.amount}
            </TableHead>
            <TableHead
              className={`min-w-[12rem] whitespace-normal ${showDivider ? "bg-amber-500/5" : ""}`}
            >
              {hr.table.paymentDescription}
            </TableHead>
            <TableHead className="sticky right-0 min-w-[7.5rem] bg-background shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]">
              {hr.table.actions}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record, index) => {
            const key =
              record.matchId ??
              `${record.invoice?.id ?? "no-inv"}-${record.payment?.id ?? "no-pay"}-${index}`;

            return (
              <TableRow key={key}>
                <TableCell className="whitespace-normal">
                  <StatusBadge status={record.matchStatus} />
                  {record.confidence !== null && record.matchStatus === "auto" && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {record.confidence.toFixed(0)}%
                    </div>
                  )}
                  {record.matchReasons && record.matchStatus !== "unmatched" && (
                    <MatchReasons reasons={record.matchReasons} />
                  )}
                </TableCell>
                <TableCell className={`font-mono text-sm ${showDivider ? "bg-sky-500/5" : ""}`}>
                  {record.invoice?.invoiceNumber ?? "—"}
                </TableCell>
                <TableCell className={showDivider ? "bg-sky-500/5" : ""}>
                  {formatDate(record.invoice?.invoiceDate)}
                </TableCell>
                <TableCell
                  className={`whitespace-normal break-words ${showDivider ? "bg-sky-500/5" : ""}`}
                >
                  {record.invoice?.client ?? "—"}
                </TableCell>
                <TableCell
                  className={`text-right font-medium tabular-nums ${showDivider ? "bg-sky-500/5" : ""}`}
                >
                  {formatAmount(record.invoice?.total)}
                </TableCell>
                <TableCell className={showDivider ? `bg-amber-500/5 ${PAYMENT_DIVIDER}` : ""}>
                  {formatDate(record.payment?.paymentDate)}
                </TableCell>
                <TableCell
                  className={`whitespace-normal break-words ${showDivider ? "bg-amber-500/5" : ""}`}
                >
                  {record.payment?.client ?? "—"}
                </TableCell>
                <TableCell
                  className={`text-right font-medium tabular-nums ${showDivider ? "bg-amber-500/5" : ""}`}
                >
                  {formatAmount(record.payment?.amount)}
                </TableCell>
                <TableCell
                  className={`whitespace-normal break-words ${showDivider ? "bg-amber-500/5" : ""}`}
                >
                  {record.payment?.description ?? "—"}
                </TableCell>
                <TableCell className="sticky right-0 bg-background shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]">
                  <div className="flex flex-col items-start justify-center gap-1">
                    {record.invoice && !record.payment && onLinkInvoice && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onLinkInvoice(record.invoice!.id)}
                      >
                        <Link2 className="size-3" />
                        {hr.table.link}
                      </Button>
                    )}
                    {record.payment && !record.invoice && onLinkPayment && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onLinkPayment(record.payment!.id)}
                      >
                        <Link2 className="size-3" />
                        {hr.table.link}
                      </Button>
                    )}
                    {record.matchId && onUnlink && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onUnlink(record.matchId!)}
                      >
                        <Unlink className="size-3" />
                        {hr.table.unlink}
                      </Button>
                    )}
                    {record.matchId && onOverride && (
                      <Button variant="ghost" size="sm" onClick={() => onOverride(record)}>
                        {hr.table.override}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        {showTotals && (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4} className="text-right font-semibold">
                {hr.table.footerTotal}
              </TableCell>
              <TableCell
                className={`text-right font-bold tabular-nums ${showDivider ? "bg-sky-500/5" : ""}`}
              >
                {showInvoiceTotal ? formatAmount(invoiceTotal) : "—"}
              </TableCell>
              <TableCell colSpan={2} className={showDivider ? `bg-amber-500/5 ${PAYMENT_DIVIDER}` : ""} />
              <TableCell
                className={`text-right font-bold tabular-nums ${showDivider ? "bg-amber-500/5" : ""}`}
              >
                {showPaymentTotal ? formatAmount(paymentTotal) : "—"}
              </TableCell>
              <TableCell className={showDivider ? "bg-amber-500/5" : ""} />
              <TableCell className="sticky right-0 bg-muted/50 shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]" />
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}
