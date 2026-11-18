export const INVOICE_NUMBER_PATTERNS = [
  /(?:račun|racun|ponuda|ur)\s*(?:br\.?|broj)?\s*([0-9]+(?:\/[A-Za-z0-9]+)+)/i,
  /br\.?\s*([0-9]+(?:\/[A-Za-z0-9]+)+)/i,
  /([0-9]+(?:\/[A-Za-z0-9]+)+)/,
];

export function extractInvoiceNumbersFromText(text: string): string[] {
  const found = new Set<string>();
  for (const pattern of INVOICE_NUMBER_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern, "gi"));
    for (const match of matches) {
      const num = match[1]?.trim();
      if (num) found.add(normalizeForCompare(num));
    }
  }
  return [...found];
}

export function normalizeForCompare(number: string): string {
  return number.trim().replace(/\s+/g, "").toUpperCase();
}

function sameInvoiceNumber(left: string, right: string): boolean {
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  if (!longer.endsWith(`/${shorter}`)) return false;
  return shorter.split("/")[0] === longer.split("/")[0];
}

export function invoiceNumbersMatch(
  invoiceNumber: string,
  description: string,
): boolean {
  const normalizedInvoice = normalizeForCompare(invoiceNumber);
  return extractInvoiceNumbersFromText(description).some((number) =>
    sameInvoiceNumber(normalizedInvoice, number),
  );
}
