import { nanoid } from "nanoid";
import { hr } from "@/lib/i18n/hr";
import type { ParsedInvoice, ParsedPayment, ParseResult } from "@/lib/excel/parser";
import { parseExcelBuffer } from "@/lib/excel/parser";
import { getDb } from "@/lib/storage/db";
import type { InvoiceRow, PaymentRow } from "@/lib/storage/db";

export type SessionUpdateCounts = {
  addedInvoices: number;
  addedPayments: number;
  updatedInvoices: number;
};

export type SessionUpdatePreview = {
  sessionId: string;
  filename: string;
  warnings: string[];
  counts: SessionUpdateCounts;
  invoiceAdds: ParsedInvoice[];
  invoiceUpdates: { id: string; next: ParsedInvoice }[];
  paymentAdds: ParsedPayment[];
};

type ExistingInvoice = Pick<
  InvoiceRow,
  "id" | "invoiceNumber" | "invoiceDate" | "client" | "baseAmount" | "vat" | "total"
>;

type ExistingPayment = Pick<PaymentRow, "id" | "rowHash">;

function invoiceChanged(existing: ExistingInvoice, next: ParsedInvoice) {
  return (
    existing.invoiceDate !== next.invoiceDate ||
    existing.client !== next.client ||
    existing.baseAmount !== next.baseAmount ||
    existing.vat !== next.vat ||
    existing.total !== next.total
  );
}

export function planSessionUpdate(input: {
  sessionId: string;
  filename: string;
  invoices: ExistingInvoice[];
  payments: ExistingPayment[];
  parsed: ParseResult;
}): SessionUpdatePreview {
  const invoicesByNumber = new Map<string, ExistingInvoice>();
  for (const invoice of input.invoices) {
    if (!invoicesByNumber.has(invoice.invoiceNumber)) invoicesByNumber.set(invoice.invoiceNumber, invoice);
  }

  const invoiceAdds: ParsedInvoice[] = [];
  const invoiceUpdates: { id: string; next: ParsedInvoice }[] = [];
  const seenInvoiceNumbers = new Set<string>();

  for (const next of input.parsed.invoices) {
    if (seenInvoiceNumbers.has(next.invoiceNumber)) continue;
    seenInvoiceNumbers.add(next.invoiceNumber);
    const existing = invoicesByNumber.get(next.invoiceNumber);
    if (!existing) invoiceAdds.push(next);
    else if (invoiceChanged(existing, next)) invoiceUpdates.push({ id: existing.id, next });
  }

  const paymentHashes = new Set(input.payments.map((payment) => payment.rowHash));
  const paymentAdds: ParsedPayment[] = [];
  const seenPaymentHashes = new Set<string>();
  for (const next of input.parsed.payments) {
    if (seenPaymentHashes.has(next.rowHash) || paymentHashes.has(next.rowHash)) continue;
    seenPaymentHashes.add(next.rowHash);
    paymentAdds.push(next);
  }

  return {
    sessionId: input.sessionId,
    filename: input.filename,
    warnings: input.parsed.warnings,
    counts: {
      addedInvoices: invoiceAdds.length,
      addedPayments: paymentAdds.length,
      updatedInvoices: invoiceUpdates.length,
    },
    invoiceAdds,
    invoiceUpdates,
    paymentAdds,
  };
}

export async function previewSessionUpdate(
  sessionId: string,
  filename: string,
  buffer: ArrayBuffer,
): Promise<SessionUpdatePreview> {
  const db = getDb();
  const session = await db.importSessions.get(sessionId);
  if (!session) throw new Error(hr.api.sessionNotFound);

  const [parsed, invoices, payments] = await Promise.all([
    parseExcelBuffer(buffer).then((result) => {
      if (result.invoices.length === 0 && result.payments.length === 0) {
        throw new Error(hr.workspace.updateExcelEmpty);
      }
      return result;
    }),
    db.invoices.where("sessionId").equals(sessionId).toArray(),
    db.payments.where("sessionId").equals(sessionId).toArray(),
  ]);

  return planSessionUpdate({
    sessionId,
    filename,
    invoices,
    payments,
    parsed,
  });
}

export async function applySessionUpdate(preview: SessionUpdatePreview) {
  const db = getDb();
  const now = new Date();

  await db.transaction("rw", db.importSessions, db.invoices, db.payments, async () => {
    if (preview.invoiceAdds.length > 0) {
      await db.invoices.bulkAdd(
        preview.invoiceAdds.map((invoice) => ({
          id: nanoid(),
          sessionId: preview.sessionId,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate,
          client: invoice.client,
          baseAmount: invoice.baseAmount,
          vat: invoice.vat,
          total: invoice.total,
          rowHash: invoice.rowHash,
        })),
      );
    }

    for (const update of preview.invoiceUpdates) {
      await db.invoices.update(update.id, {
        invoiceDate: update.next.invoiceDate,
        client: update.next.client,
        baseAmount: update.next.baseAmount,
        vat: update.next.vat,
        total: update.next.total,
        rowHash: update.next.rowHash,
      });
    }

    if (preview.paymentAdds.length > 0) {
      await db.payments.bulkAdd(
        preview.paymentAdds.map((payment) => ({
          id: nanoid(),
          sessionId: preview.sessionId,
          paymentDate: payment.paymentDate,
          amount: payment.amount,
          client: payment.client,
          description: payment.description,
          rowHash: payment.rowHash,
        })),
      );
    }

    await db.importSessions.update(preview.sessionId, {
      filename: preview.filename,
      updatedAt: now,
    });
  });
}
