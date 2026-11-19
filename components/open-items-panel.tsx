"use client";

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
import { hr } from "@/lib/i18n/hr";
import type { OpenItem } from "@/lib/ledger";

export function OpenItemsPanel({
  items,
  onLinkInvoice,
}: {
  items: OpenItem[];
  onLinkInvoice?: (invoiceId: string) => void;
}) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{hr.ledger.openItemsEmpty}</p>;
  }

  const openTotal = items.reduce((sum, item) => sum + item.openAmount, 0);

  return (
    <div className="overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{hr.ledger.client}</TableHead>
            <TableHead>{hr.ledger.document}</TableHead>
            <TableHead>{hr.ledger.date}</TableHead>
            <TableHead className="text-right">{hr.ledger.openAmount}</TableHead>
            <TableHead className="text-right">{hr.ledger.daysOpen}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="max-w-56 whitespace-normal">{item.client}</TableCell>
              <TableCell className="font-mono text-xs">{item.document}</TableCell>
              <TableCell>{formatDate(item.date)}</TableCell>
              <TableCell className="text-right font-medium text-destructive tabular-nums">
                {formatAmount(item.openAmount)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{item.daysOpen}</TableCell>
              <TableCell className="text-right">
                {onLinkInvoice ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-1.5 text-xs"
                    onClick={() => onLinkInvoice(item.id)}
                  >
                    {hr.ledger.linkOpen}
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={3} className="text-right font-semibold">
              {hr.table.footerTotal}
            </TableCell>
            <TableCell className="text-right font-bold tabular-nums">{formatAmount(openTotal)}</TableCell>
            <TableCell />
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
