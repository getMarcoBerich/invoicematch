"use client";

import { useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatAmount, formatDate } from "@/lib/format";
import { hr } from "@/lib/i18n/hr";
import type { CloseCall, CloseCallSignal } from "@/lib/matching/close-calls";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function matchLabel(signal: CloseCallSignal) {
  if (signal === "nearAmount") return hr.table.signals.nearAmount;
  return hr.table.signals[signal];
}

export function CloseCallsPanel({
  calls,
  onConnect,
}: {
  calls: CloseCall[];
  onConnect?: (invoiceId: string, paymentId: string) => void | Promise<void>;
}) {
  const [linking, setLinking] = useState<string | null>(null);
  if (calls.length === 0) return null;

  const connect = async (call: CloseCall) => {
    if (!onConnect) return;
    const key = `${call.invoiceId}-${call.paymentId}`;
    setLinking(key);
    try {
      await onConnect(call.invoiceId, call.paymentId);
    } finally {
      setLinking(null);
    }
  };

  return (
    <details className="rounded-md border" open>
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
        {hr.workspace.tabs.closeCalls} ({calls.length})
      </summary>
      <p className="px-3 pb-2 text-xs text-muted-foreground">{hr.ledger.closeCallsHint}</p>
      <div className="max-h-80 overflow-auto border-t">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{hr.ledger.closeCallInvoice}</TableHead>
              <TableHead>{hr.ledger.closeCallPayment}</TableHead>
              <TableHead>{hr.ledger.closeCallMatches}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {calls.map((call) => {
              const key = `${call.invoiceId}-${call.paymentId}`;
              const busy = linking === key;
              return (
                <TableRow key={key}>
                  <TableCell className="align-top whitespace-normal">
                    <div className="font-mono text-xs">{call.invoiceNumber}</div>
                    <div className="text-xs">{call.invoiceClient}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(call.invoiceDate)} · {formatAmount(call.amount)}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-72 align-top whitespace-normal">
                    <div className="text-xs">{call.paymentClient}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(call.paymentDate)} · {formatAmount(call.paymentAmount)}
                    </div>
                    {call.description ? (
                      <div className="mt-1 text-xs text-muted-foreground">{call.description}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex flex-wrap gap-1">
                      {call.matches.map((signal) => (
                        <Badge key={signal} variant="outline">
                          {matchLabel(signal)}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="align-top text-right">
                    {onConnect ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy || linking !== null}
                        onClick={() => void connect(call)}
                      >
                        {busy ? <Loader2 className="size-3 animate-spin" /> : <Link2 className="size-3" />}
                        {hr.table.link}
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </details>
  );
}
