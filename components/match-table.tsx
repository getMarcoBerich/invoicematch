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
  const showInvoiceTotal =
    tabView === "matched" || tabView === "unmatched-invoices";
  const showPaymentTotal =
    tabView === "matched" || tabView === "unmatched-payments";

  return (
    <div className="rounded-md border [&_[data-slot=table-cell]]:px-1.5 [&_[data-slot=table-cell]]:py-1 [&_[data-slot=table-head]]:h-8 [&_[data-slot=table-head]]:px-1.5">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[7.5rem] whitespace-normal">{hr.table.status}</TableHead>
            <TableHead className="min-w-[6rem]">{hr.table.invoiceNumber}</TableHead>
            <TableHead className="min-w-[6rem]">{hr.table.invoiceDate}</TableHead>
            <TableHead className="min-w-[12rem] whitespace-normal">
              {hr.table.invoiceClient}
            </TableHead>
            <TableHead className="min-w-[5.5rem] text-right">{hr.table.total}</TableHead>
            <TableHead className="min-w-[6rem]">{hr.table.paymentDate}</TableHead>
            <TableHead className="min-w-[12rem] whitespace-normal">
              {hr.table.paymentClient}
            </TableHead>
            <TableHead className="min-w-[5.5rem] text-right">{hr.table.amount}</TableHead>
            <TableHead className="min-w-[12rem] whitespace-normal">
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
                <TableCell className="whitespace-normal align-top">
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
                <TableCell className="font-mono text-sm">
                  {record.invoice?.invoiceNumber ?? "—"}
                </TableCell>
                <TableCell>{formatDate(record.invoice?.invoiceDate)}</TableCell>
                <TableCell className="whitespace-normal break-words align-top">
                  {record.invoice?.client ?? "—"}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatAmount(record.invoice?.total)}
                </TableCell>
                <TableCell>{formatDate(record.payment?.paymentDate)}</TableCell>
                <TableCell className="whitespace-normal break-words align-top">
                  {record.payment?.client ?? "—"}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatAmount(record.payment?.amount)}
                </TableCell>
                <TableCell className="whitespace-normal break-words align-top">
                  {record.payment?.description ?? "—"}
                </TableCell>
                <TableCell className="sticky right-0 bg-background align-top shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]">
                  <div className="flex flex-col gap-1">
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
              <TableCell className="text-right font-bold tabular-nums">
                {showInvoiceTotal ? formatAmount(invoiceTotal) : "—"}
              </TableCell>
              <TableCell colSpan={2} />
              <TableCell className="text-right font-bold tabular-nums">
                {showPaymentTotal ? formatAmount(paymentTotal) : "—"}
              </TableCell>
              <TableCell />
              <TableCell className="sticky right-0 bg-muted/50 shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]" />
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}
