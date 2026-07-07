export function normalizeClientName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}

export function normalizeInvoiceNumber(number: string): string {
  return number.trim().replace(/\s+/g, "");
}

/** Parses amounts from Excel cells, including Croatian format (e.g. 1.000,00). */
export function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    let cleaned = value.trim().replace(/\s/g, "").replace(/[^\d,.-]/g, "");
    if (!cleaned) return null;

    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");

    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else if (lastDot > lastComma && cleaned.includes(",")) {
      cleaned = cleaned.replace(/,/g, "");
    } else if (lastComma >= 0 && lastDot < 0) {
      cleaned = cleaned.replace(",", ".");
    } else if (lastDot >= 0) {
      const parts = cleaned.split(".");
      if (parts.length > 2) {
        const decimals = parts.pop() ?? "";
        cleaned = `${parts.join("")}.${decimals}`;
      }
    }

    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

export function parseDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return date.toISOString().slice(0, 10);
  }

  if (typeof value === "string") {
    const trimmed = value.trim().replace(/\.$/, "");
    const dotMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (dotMatch) {
      const [, day, month, year] = dotMatch;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return isoMatch[0];
  }

  return null;
}

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value !== null) {
    const obj = value as { result?: unknown; text?: string; richText?: { text: string }[] };
    if (obj.result !== undefined) return cellText(obj.result);
    if (obj.text) return obj.text.trim();
    if (obj.richText) return obj.richText.map((r) => r.text).join("").trim();
  }
  return String(value).trim();
}

export function hashRow(parts: string[]): string {
  const input = parts.join("|");
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
