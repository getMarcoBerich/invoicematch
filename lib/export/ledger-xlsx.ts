import ExcelJS from "exceljs";
import { hr } from "@/lib/i18n/hr";
import type { ClientLedger, LedgerLine } from "@/lib/ledger";

const MONEY_FORMAT = "#,##0.00";
const DATE_FORMAT = "dd.mm.yyyy";
const HEADER_FILL = "FFF3F4F6";
const INVOICE_FILL = "FFF0F9FF";
const PAYMENT_FILL = "FFFFFBEB";
const TITLE_FILL = "FFE8EEF5";

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD0D5DD" } },
  left: { style: "thin", color: { argb: "FFD0D5DD" } },
  bottom: { style: "thin", color: { argb: "FFD0D5DD" } },
  right: { style: "thin", color: { argb: "FFD0D5DD" } },
};

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || "sesija";
}

export function ledgerXlsxFilename(sessionName: string, clientLabel?: string): string {
  const session = sanitizeFilename(sessionName);
  const client = clientLabel ? `-${sanitizeFilename(clientLabel)}` : "";
  return `${hr.export.ledgerFilenamePrefix}-${session}${client}.xlsx`;
}

function uniqueSheetName(raw: string, used: Set<string>): string {
  const cleaned = raw.replace(/[\\/*?:[\]]/g, " ").replace(/\s+/g, " ").trim() || "Klijent";
  const base = cleaned.slice(0, 31);
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${n})`;
    name = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    n += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

function excelDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function kindLabel(kind: LedgerLine["kind"]): string {
  return kind === "invoice" ? hr.ledger.invoice : hr.ledger.payment;
}

function paintHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.border = thinBorder;
  });
}

function paintMoney(cell: ExcelJS.Cell, value: number) {
  cell.value = value;
  cell.numFmt = MONEY_FORMAT;
  cell.alignment = { horizontal: "right" };
}

function applyBalanceFont(cell: ExcelJS.Cell, balance: number, bold = false) {
  if (balance > 0.004) {
    cell.font = { bold, color: { argb: "FFB91C1C" } };
  } else if (balance < -0.004) {
    cell.font = { bold, color: { argb: "FF047857" } };
  } else if (bold) {
    cell.font = { bold: true };
  }
}

function columnLetter(index: number): string {
  return String.fromCharCode(64 + index);
}

function addCardSheet(workbook: ExcelJS.Workbook, ledger: ClientLedger, sheetName: string) {
  const showClient = ledger.clients.length > 1;
  const headers = [
    hr.ledger.date,
    hr.ledger.kind,
    ...(showClient ? [hr.ledger.client] : []),
    hr.ledger.document,
    hr.ledger.debit,
    hr.ledger.credit,
    hr.ledger.balance,
  ];
  const debitCol = headers.indexOf(hr.ledger.debit) + 1;
  const creditCol = headers.indexOf(hr.ledger.credit) + 1;
  const balanceCol = headers.indexOf(hr.ledger.balance) + 1;
  const documentCol = headers.indexOf(hr.ledger.document) + 1;
  const clientCol = showClient ? headers.indexOf(hr.ledger.client) + 1 : 0;
  const headerRowNumber = 2;
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = headers.map((header) => ({
    width: header === hr.ledger.document ? 42 : header === hr.ledger.client ? 28 : 16,
  }));

  sheet.mergeCells(1, 1, 1, headers.length);
  const title = sheet.getCell("A1");
  title.value = ledger.label;
  title.font = { bold: true, size: 14 };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TITLE_FILL } };

  const headerRow = sheet.getRow(headerRowNumber);
  headers.forEach((header, index) => {
    headerRow.getCell(index + 1).value = header;
  });
  paintHeader(headerRow);
  sheet.views = [{ state: "frozen", ySplit: headerRowNumber }];

  ledger.lines.forEach((line, index) => {
    const row = sheet.getRow(headerRowNumber + 1 + index);
    const date = excelDate(line.date);
    row.getCell(1).value = date ?? line.date ?? "";
    if (date) row.getCell(1).numFmt = DATE_FORMAT;
    row.getCell(2).value = kindLabel(line.kind);
    if (clientCol) row.getCell(clientCol).value = line.client;
    row.getCell(documentCol).value = line.document;
    if (line.kind === "invoice") paintMoney(row.getCell(debitCol), line.debit);
    if (line.kind === "payment") paintMoney(row.getCell(creditCol), line.credit);
    paintMoney(row.getCell(balanceCol), line.balance);
    applyBalanceFont(row.getCell(balanceCol), line.balance);
    const fill = line.kind === "invoice" ? INVOICE_FILL : PAYMENT_FILL;
    for (let col = 1; col <= headers.length; col++) {
      const cell = row.getCell(col);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      cell.border = thinBorder;
    }
  });

  const firstLine = headerRowNumber + 1;
  const lastLine = headerRowNumber + Math.max(ledger.lines.length, 1);
  const debitLetter = columnLetter(debitCol);
  const creditLetter = columnLetter(creditCol);
  const totalRow = sheet.getRow(headerRowNumber + ledger.lines.length + 1);
  totalRow.getCell(documentCol).value = hr.table.footerTotal;
  if (ledger.lines.length > 0) {
    totalRow.getCell(debitCol).value = {
      formula: `SUM(${debitLetter}${firstLine}:${debitLetter}${lastLine})`,
    };
    totalRow.getCell(creditCol).value = {
      formula: `SUM(${creditLetter}${firstLine}:${creditLetter}${lastLine})`,
    };
    totalRow.getCell(balanceCol).value = {
      formula: `SUM(${debitLetter}${firstLine}:${debitLetter}${lastLine})-SUM(${creditLetter}${firstLine}:${creditLetter}${lastLine})`,
    };
  } else {
    paintMoney(totalRow.getCell(debitCol), 0);
    paintMoney(totalRow.getCell(creditCol), 0);
    paintMoney(totalRow.getCell(balanceCol), 0);
  }
  totalRow.getCell(debitCol).numFmt = MONEY_FORMAT;
  totalRow.getCell(creditCol).numFmt = MONEY_FORMAT;
  totalRow.getCell(balanceCol).numFmt = MONEY_FORMAT;
  totalRow.font = { bold: true };
  applyBalanceFont(totalRow.getCell(balanceCol), ledger.balance, true);
  for (let col = 1; col <= headers.length; col++) {
    const cell = totalRow.getCell(col);
    cell.border = thinBorder;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  }

  sheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
  };
  sheet.headerFooter = {
    oddFooter: `&L${ledger.label}&R&P / &N`,
  };
}

export async function buildLedgerXlsx(ledgers: ClientLedger[]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Uparivanje računa";
  const usedNames = new Set<string>();
  for (const ledger of ledgers) {
    addCardSheet(workbook, ledger, uniqueSheetName(ledger.label, usedNames));
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export async function downloadLedgerWorkbook(ledgers: ClientLedger[], filename: string) {
  const buffer = await buildLedgerXlsx(ledgers);
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
