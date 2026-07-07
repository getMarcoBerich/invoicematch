import { hr } from "@/lib/i18n/hr";
import type { RecordRow } from "@/lib/types";

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function statusLabel(status: string): string {
  const labels = hr.export.statusLabels as Record<string, string>;
  return labels[status] ?? status;
}

export function buildRecordsCsv(records: RecordRow[]): string {
  const headers = [
    hr.export.status,
    hr.export.confidence,
    hr.export.invoiceNumber,
    hr.export.invoiceDate,
    hr.export.invoiceClient,
    hr.export.invoiceTotal,
    hr.export.paymentDate,
    hr.export.paymentAmount,
    hr.export.paymentClient,
    hr.export.paymentDescription,
  ];

  const rows = records.map((r) =>
    [
      statusLabel(r.matchStatus),
      r.confidence ?? "",
      r.invoice?.invoiceNumber ?? "",
      r.invoice?.invoiceDate ?? "",
      r.invoice?.client ?? "",
      r.invoice?.total ?? "",
      r.payment?.paymentDate ?? "",
      r.payment?.amount ?? "",
      r.payment?.client ?? "",
      r.payment?.description ?? "",
    ]
      .map(escapeCsv)
      .join(","),
  );

  return [headers.join(","), ...rows].join("\n");
}

export function recordsCsvFilename(sourceFilename: string, variant: "all" | "view" = "all"): string {
  const base = sourceFilename.replace(/\.xlsx$/i, "");
  const suffix = variant === "view" ? hr.export.filenameSuffixView : "";
  return `${hr.export.filenamePrefix}-${base}${suffix}.csv`;
}

export function downloadCsvFile(content: string, filename: string) {
  const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
