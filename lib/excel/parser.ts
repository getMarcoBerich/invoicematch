import ExcelJS from "exceljs";
import { hr } from "@/lib/i18n/hr";
import {
  cellText,
  hashRow,
  normalizeClientName,
  normalizeInvoiceNumber,
  parseAmount,
  parseDate,
} from "./normalize";

export type ParsedInvoice = {
  invoiceNumber: string;
  invoiceDate: string;
  client: string;
  clientNormalized: string;
  baseAmount: number;
  vat: number;
  total: number;
  rowHash: string;
  sourceRow: number;
};

export type ParsedPayment = {
  paymentDate: string;
  amount: number;
  client: string;
  clientNormalized: string;
  description: string;
  rowHash: string;
  sourceRow: number;
};

export type ParseResult = {
  invoices: ParsedInvoice[];
  payments: ParsedPayment[];
  warnings: string[];
  sheetName: string;
};

type KarticaLayout = {
  invoice: { number: number; date: number; client: number; base: number | null; vat: number | null; total: number };
  payment: { date: number; amount: number; client: number; description: number };
};

function findHeaderRow(sheet: ExcelJS.Worksheet): number {
  for (let row = 1; row <= Math.min(sheet.rowCount, 20); row++) {
    let hasBroj = false;
    let hasIznos = false;
    for (let col = 1; col <= 20; col++) {
      const text = cellText(sheet.getCell(row, col).value).toLowerCase().trim();
      if (text === "broj") hasBroj = true;
      if (text === "iznos" || text.includes("iznos")) hasIznos = true;
    }
    if (hasBroj && hasIznos) return row;
  }
  return 3;
}

function detectLayout(sheet: ExcelJS.Worksheet, headerRow: number): KarticaLayout {
  let broj = 1;
  let total = 8;
  let osnovica: number | null = null;
  let pdv: number | null = null;
  let iznos: number | null = null;
  let opis: number | null = null;
  const datums: number[] = [];
  const klijents: number[] = [];

  for (let col = 1; col <= 20; col++) {
    const text = cellText(sheet.getCell(headerRow, col).value).toLowerCase().trim();
    if (!text) continue;

    if (text === "broj") broj = col;
    else if (text === "datum") datums.push(col);
    else if (text === "klijent") klijents.push(col);
    else if (text === "osnovica") osnovica = col;
    else if (text === "pdv") pdv = col;
    else if (text === "total") total = col;
    else if (text.includes("iznos")) iznos = col;
    else if (text.includes("opis")) opis = col;
  }

  if (iznos === null) {
    throw new Error(hr.parser.noPaymentColumns);
  }

  const invoiceDate = datums[0] ?? 2;
  const paymentDate = datums[1] ?? iznos - 1;
  const invoiceClient = klijents[0] ?? 3;
  const paymentClient = klijents[1] ?? iznos + 1;

  return {
    invoice: { number: broj, date: invoiceDate, client: invoiceClient, base: osnovica, vat: pdv, total },
    payment: { date: paymentDate, amount: iznos, client: paymentClient, description: opis ?? iznos + 2 },
  };
}

function parseInvoiceRow(
  sheet: ExcelJS.Worksheet,
  row: number,
  layout: KarticaLayout,
): { invoice: ParsedInvoice | null; warning?: string } {
  const cols = layout.invoice;
  const invoiceNumber = cellText(sheet.getCell(row, cols.number).value);
  if (!invoiceNumber) return { invoice: null };

  const invoiceDate = parseDate(sheet.getCell(row, cols.date).value);
  const client = cellText(sheet.getCell(row, cols.client).value);
  const baseAmount =
    cols.base === null ? 0 : (parseAmount(sheet.getCell(row, cols.base).value) ?? 0);
  const vat = cols.vat === null ? 0 : (parseAmount(sheet.getCell(row, cols.vat).value) ?? 0);
  const total = parseAmount(sheet.getCell(row, cols.total).value) ?? 0;

  if (!invoiceDate) {
    return {
      invoice: null,
      warning: hr.parser.invoiceInvalidDate(row, invoiceNumber),
    };
  }
  if (!client) {
    return {
      invoice: null,
      warning: hr.parser.invoiceMissingClient(row, invoiceNumber),
    };
  }

  const normalizedNumber = normalizeInvoiceNumber(invoiceNumber);
  const rowHash = hashRow([
    normalizedNumber,
    invoiceDate,
    String(total),
    normalizeClientName(client),
  ]);

  return {
    invoice: {
      invoiceNumber: normalizedNumber,
      invoiceDate,
      client,
      clientNormalized: normalizeClientName(client),
      baseAmount,
      vat,
      total,
      rowHash,
      sourceRow: row,
    },
  };
}

function parsePaymentRow(
  sheet: ExcelJS.Worksheet,
  row: number,
  layout: KarticaLayout,
): { payment: ParsedPayment | null; warning?: string } {
  const cols = layout.payment;
  const amount = parseAmount(sheet.getCell(row, cols.amount).value);
  const paymentDateRaw = sheet.getCell(row, cols.date).value;
  const hasDate = paymentDateRaw !== null && paymentDateRaw !== undefined && paymentDateRaw !== "";

  if (amount === null && !hasDate) return { payment: null };
  if (amount === null) {
    return { payment: null, warning: hr.parser.paymentInvalidAmount(row) };
  }

  const paymentDate = parseDate(paymentDateRaw);
  const client = cellText(sheet.getCell(row, cols.client).value);
  const description = cellText(sheet.getCell(row, cols.description).value);

  if (!paymentDate) {
    return { payment: null, warning: hr.parser.paymentInvalidDate(row) };
  }
  if (!client) {
    return { payment: null, warning: hr.parser.paymentMissingClient(row) };
  }

  const rowHash = hashRow([
    paymentDate,
    String(amount),
    normalizeClientName(client),
    description,
  ]);

  return {
    payment: {
      paymentDate,
      amount,
      client,
      clientNormalized: normalizeClientName(client),
      description,
      rowHash,
      sourceRow: row,
    },
  };
}

export async function parseExcelBuffer(buffer: ArrayBuffer | Buffer): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  const loadBuffer =
    buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer);
  // exceljs Buffer type differs from Node 22 Buffer typings
  await workbook.xlsx.load(loadBuffer as never);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error(hr.parser.noSheets);
  }

  const headerRow = findHeaderRow(sheet);
  const layout = detectLayout(sheet, headerRow);
  const invoices: ParsedInvoice[] = [];
  const payments: ParsedPayment[] = [];
  const warnings: string[] = [];
  const seenInvoiceHashes = new Set<string>();
  const seenPaymentHashes = new Set<string>();

  for (let row = headerRow + 1; row <= sheet.rowCount; row++) {
    const invoiceResult = parseInvoiceRow(sheet, row, layout);
    if (invoiceResult.warning) warnings.push(invoiceResult.warning);
    if (invoiceResult.invoice && !seenInvoiceHashes.has(invoiceResult.invoice.rowHash)) {
      seenInvoiceHashes.add(invoiceResult.invoice.rowHash);
      invoices.push(invoiceResult.invoice);
    }

    const paymentResult = parsePaymentRow(sheet, row, layout);
    if (paymentResult.warning) warnings.push(paymentResult.warning);
    if (paymentResult.payment && !seenPaymentHashes.has(paymentResult.payment.rowHash)) {
      seenPaymentHashes.add(paymentResult.payment.rowHash);
      payments.push(paymentResult.payment);
    }
  }

  return {
    invoices,
    payments,
    warnings,
    sheetName: sheet.name,
  };
}

export async function parseExcelFile(filePath: string): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return parseExcelBuffer(buffer);
}
