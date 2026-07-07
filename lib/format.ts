import { format, parseISO } from "date-fns";

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "dd.MM.yyyy");
  } catch {
    return iso;
  }
}

export function formatAmount(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("hr-HR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDateTime(date: Date | string): string {
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (Number.isNaN(d.getTime())) return "—";
    return format(d, "dd.MM.yyyy HH:mm");
  } catch {
    return "—";
  }
}
