"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadLedgerWorkbook, ledgerXlsxFilename } from "@/lib/export/ledger-xlsx";
import { formatAmount, formatDate } from "@/lib/format";
import { hr } from "@/lib/i18n/hr";
import { ledgerTotals, type ClientLedger } from "@/lib/ledger";
import { cn } from "@/lib/utils";

function balanceClass(balance: number) {
  if (balance > 0.004) return "text-destructive";
  if (balance < -0.004) return "text-emerald-700 dark:text-emerald-400";
  return "";
}

function AmountWithCount({ amount, count }: { amount: number; count: string }) {
  return (
    <div className="text-right">
      <div className="font-medium tabular-nums">{formatAmount(amount)}</div>
      <div className="text-xs text-muted-foreground">{count}</div>
    </div>
  );
}

export function LedgerPanel({
  ledgers,
  sessionName,
  onExportError,
  onLinkInvoice,
  onLinkPayment,
}: {
  ledgers: ClientLedger[];
  sessionName: string;
  onExportError?: (message: string) => void;
  onLinkInvoice?: (invoiceId: string) => void;
  onLinkPayment?: (paymentId: string) => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const openLedger = ledgers.find((ledger) => ledger.payerKey === openKey) ?? null;

  useEffect(() => {
    if (openKey && !ledgers.some((ledger) => ledger.payerKey === openKey)) {
      setOpenKey(null);
    }
  }, [ledgers, openKey]);

  if (ledgers.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
        {hr.ledger.noClients}
      </div>
    );
  }

  const totals = ledgerTotals(ledgers);
  const invoiceShade = "bg-sky-500/5 dark:bg-sky-500/10";
  const paymentShade = "bg-amber-500/5 dark:bg-amber-500/10";

  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">
        {hr.ledger.openHint} {hr.ledger.balanceHint}
      </p>
      <div className="rounded-md border [&_[data-slot=table-cell]]:px-1.5 [&_[data-slot=table-cell]]:py-1 [&_[data-slot=table-head]]:h-8 [&_[data-slot=table-head]]:px-1.5">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[14rem]">{hr.ledger.client}</TableHead>
              <TableHead className={`min-w-[8rem] text-right ${invoiceShade}`}>
                {hr.ledger.invoiced}
              </TableHead>
              <TableHead className={`min-w-[8rem] text-right ${paymentShade}`}>
                {hr.ledger.paid}
              </TableHead>
              <TableHead className="min-w-[8rem] text-right">{hr.ledger.balance}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ledgers.map((ledger) => (
              <TableRow
                key={ledger.payerKey}
                className="cursor-pointer"
                title={hr.ledger.openHint}
                onDoubleClick={() => setOpenKey(ledger.payerKey)}
              >
                <TableCell className="whitespace-normal">
                  <div className="font-medium">{ledger.label}</div>
                  {ledger.clients.length > 1 && (
                    <div className="text-xs text-muted-foreground">
                      {ledger.clients.join(" · ")}
                    </div>
                  )}
                </TableCell>
                <TableCell className={invoiceShade}>
                  <AmountWithCount
                    amount={ledger.invoiced}
                    count={hr.workspace.stats.invoicesCount(ledger.invoiceCount)}
                  />
                </TableCell>
                <TableCell className={paymentShade}>
                  <AmountWithCount
                    amount={ledger.paid}
                    count={hr.workspace.stats.paymentsCount(ledger.paymentCount)}
                  />
                </TableCell>
                <TableCell
                  className={cn("text-right font-semibold tabular-nums", balanceClass(ledger.balance))}
                >
                  {formatAmount(ledger.balance)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="text-right font-semibold">{hr.table.footerTotal}</TableCell>
              <TableCell className={invoiceShade}>
                <AmountWithCount
                  amount={totals.invoiced}
                  count={hr.workspace.stats.invoicesCount(totals.invoiceCount)}
                />
              </TableCell>
              <TableCell className={paymentShade}>
                <AmountWithCount
                  amount={totals.paid}
                  count={hr.workspace.stats.paymentsCount(totals.paymentCount)}
                />
              </TableCell>
              <TableCell
                className={cn("text-right font-bold tabular-nums", balanceClass(totals.balance))}
              >
                {formatAmount(totals.balance)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      <LedgerCardDialog
        ledger={openLedger}
        sessionName={sessionName}
        onExportError={onExportError}
        onLinkInvoice={onLinkInvoice}
        onLinkPayment={onLinkPayment}
        onOpenChange={(open) => {
          if (!open) setOpenKey(null);
        }}
      />
    </div>
  );
}

function LedgerCardDialog({
  ledger,
  sessionName,
  onExportError,
  onLinkInvoice,
  onLinkPayment,
  onOpenChange,
}: {
  ledger: ClientLedger | null;
  sessionName: string;
  onExportError?: (message: string) => void;
  onLinkInvoice?: (invoiceId: string) => void;
  onLinkPayment?: (paymentId: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={ledger !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[min(72rem,calc(100%-2rem))] max-w-none flex-col overflow-hidden sm:max-w-none">
        {ledger && (
          <>
            <DialogHeader>
              <DialogTitle>{hr.ledger.cardTitle(ledger.label)}</DialogTitle>
              <DialogDescription>
                {hr.ledger.cardDescription}
                {ledger.clients.length > 1 ? ` ${ledger.clients.join(" · ")}` : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md bg-sky-500/5 px-2 py-1.5 dark:bg-sky-500/10">
                <p className="text-xs text-muted-foreground">{hr.ledger.invoiced}</p>
                <p className="text-lg font-bold tabular-nums">{formatAmount(ledger.invoiced)}</p>
                <p className="text-xs text-muted-foreground">
                  {hr.workspace.stats.invoicesCount(ledger.invoiceCount)}
                </p>
              </div>
              <div className="rounded-md bg-amber-500/5 px-2 py-1.5 dark:bg-amber-500/10">
                <p className="text-xs text-muted-foreground">{hr.ledger.paid}</p>
                <p className="text-lg font-bold tabular-nums">{formatAmount(ledger.paid)}</p>
                <p className="text-xs text-muted-foreground">
                  {hr.workspace.stats.paymentsCount(ledger.paymentCount)}
                </p>
              </div>
              <div className="rounded-md px-2 py-1.5">
                <p className="text-xs text-muted-foreground">{hr.ledger.balance}</p>
                <p className={cn("text-lg font-bold tabular-nums", balanceClass(ledger.balance))}>
                  {formatAmount(ledger.balance)}
                </p>
                <p className="text-xs text-muted-foreground">{hr.ledger.balanceHint}</p>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto rounded-md border [&_[data-slot=table-cell]]:px-1.5 [&_[data-slot=table-cell]]:py-1 [&_[data-slot=table-head]]:h-8 [&_[data-slot=table-head]]:px-1.5">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[6rem]">{hr.ledger.date}</TableHead>
                    <TableHead className="min-w-[5rem]">{hr.ledger.kind}</TableHead>
                    {ledger.clients.length > 1 && (
                      <TableHead className="min-w-[10rem]">{hr.ledger.client}</TableHead>
                    )}
                    <TableHead className="min-w-[12rem]">{hr.ledger.document}</TableHead>
                    <TableHead className="min-w-[6rem] text-right">{hr.ledger.debit}</TableHead>
                    <TableHead className="min-w-[6rem] text-right">{hr.ledger.credit}</TableHead>
                    <TableHead className="min-w-[6rem] text-right">{hr.ledger.balance}</TableHead>
                    <TableHead className="min-w-[6rem] text-right">{hr.ledger.openAmount}</TableHead>
                    <TableHead className="min-w-[4rem] text-right">{hr.ledger.daysOpen}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.lines.map((line) => {
                    const shade =
                      line.kind === "invoice"
                        ? "bg-sky-500/5 dark:bg-sky-500/10"
                        : "bg-amber-500/5 dark:bg-amber-500/10";
                    return (
                      <TableRow key={`${line.kind}-${line.id}`}>
                        <TableCell className={shade}>{formatDate(line.date)}</TableCell>
                        <TableCell className={shade}>
                          {line.kind === "invoice" ? hr.ledger.invoice : hr.ledger.payment}
                        </TableCell>
                        {ledger.clients.length > 1 && (
                          <TableCell className={`whitespace-normal break-words ${shade}`}>
                            {line.client}
                          </TableCell>
                        )}
                        <TableCell className={`whitespace-normal break-words ${shade}`}>
                          {line.document || "—"}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${shade}`}>
                          {line.kind === "invoice" ? formatAmount(line.debit) : "—"}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${shade}`}>
                          {line.kind === "payment" ? formatAmount(line.credit) : "—"}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-medium tabular-nums",
                            shade,
                            balanceClass(line.balance),
                          )}
                        >
                          {formatAmount(line.balance)}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${shade}`}>
                          {line.openAmount > 0.01 ? (
                            <div className="flex flex-col items-end gap-1">
                              <span className="font-medium text-destructive">
                                {formatAmount(line.openAmount)}
                              </span>
                              {((line.kind === "invoice" && onLinkInvoice) ||
                                (line.kind === "payment" && onLinkPayment)) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-1.5 text-xs"
                                  onClick={() =>
                                    line.kind === "invoice"
                                      ? onLinkInvoice?.(line.id)
                                      : onLinkPayment?.(line.id)
                                  }
                                >
                                  {hr.ledger.linkOpen}
                                </Button>
                              )}
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${shade}`}>
                          {line.daysOpen ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell
                      colSpan={ledger.clients.length > 1 ? 4 : 3}
                      className="text-right font-semibold"
                    >
                      {hr.table.footerTotal}
                    </TableCell>
                    <TableCell className="text-right font-bold tabular-nums">
                      {formatAmount(ledger.invoiced)}
                    </TableCell>
                    <TableCell className="text-right font-bold tabular-nums">
                      {formatAmount(ledger.paid)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-bold tabular-nums",
                        balanceClass(ledger.balance),
                      )}
                    >
                      {formatAmount(ledger.balance)}
                    </TableCell>
                    <TableCell />
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  void downloadLedgerWorkbook(
                    [ledger],
                    ledgerXlsxFilename(sessionName, ledger.label),
                  ).catch((err) => {
                    onExportError?.(err instanceof Error ? err.message : hr.api.exportFailed);
                  });
                }}
              >
                <Download className="size-4" />
                {hr.workspace.exportExcel}
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {hr.ledger.close}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
