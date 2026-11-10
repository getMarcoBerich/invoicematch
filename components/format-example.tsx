import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hr } from "@/lib/i18n/hr";

const columns = [
  { key: "A", label: "Broj", section: "invoice" as const },
  { key: "B", label: "Datum", section: "invoice" as const },
  { key: "C", label: "Klijent", section: "invoice" as const },
  { key: "D", label: "TOTAL", section: "invoice" as const },
  { key: "E", label: "", section: "gap" as const },
  { key: "F", label: "", section: "gap" as const },
  { key: "G", label: "Datum", section: "payment" as const },
  { key: "H", label: "Iznos", section: "payment" as const },
  { key: "I", label: "Klijent", section: "payment" as const },
  { key: "J", label: "Opis plaćanja", section: "payment" as const },
];

const exampleRows = [
  [
    "12/2026",
    "15.01.2026",
    "Klijent 1",
    "1.000,00",
    "",
    "",
    "15.01.2026",
    "1.000,00",
    "Klijent 1",
    "Uplata računa 12/2026",
  ],
  [
    "13/2026",
    "20.01.2026",
    "Klijent 2",
    "500,00",
    "",
    "",
    "22.01.2026",
    "500,00",
    "Klijent 2",
    "Plaćanje po računu br. 13/2026",
  ],
];

function sectionClass(section: "invoice" | "payment" | "gap") {
  if (section === "invoice") return "bg-sky-500/10 font-medium text-sky-950 dark:text-sky-100";
  if (section === "payment") return "bg-amber-500/10 font-medium text-amber-950 dark:text-amber-100";
  return "bg-muted/30";
}

function cellClass(section: "invoice" | "payment" | "gap") {
  if (section === "invoice") return "bg-sky-500/5";
  if (section === "payment") return "bg-amber-500/5";
  return "bg-muted/20";
}

export function FormatExample() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{hr.upload.formatExample.title}</CardTitle>
        <CardDescription>{hr.upload.formatExample.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-sky-500/10 px-2 py-1 text-sky-950 dark:text-sky-100">
            <span className="size-2 rounded-full bg-sky-500" />
            {hr.upload.formatExample.invoicesSection}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-amber-950 dark:text-amber-100">
            <span className="size-2 rounded-full bg-amber-500" />
            {hr.upload.formatExample.paymentsSection}
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border [&_[data-slot=table-cell]]:align-middle [&_[data-slot=table-head]]:align-middle">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {columns.map((col) => (
                  <TableHead
                    key={`letter-${col.key}`}
                    className={`h-8 px-2 text-center text-[10px] uppercase tracking-wide text-muted-foreground ${cellClass(col.section)}`}
                  >
                    {col.key}
                  </TableHead>
                ))}
              </TableRow>
              <TableRow className="hover:bg-transparent">
                {columns.map((col) => (
                  <TableHead
                    key={`header-${col.key}`}
                    className={`px-2 text-center text-xs ${sectionClass(col.section)}`}
                  >
                    {col.label || "—"}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {exampleRows.map((row, rowIndex) => (
                <TableRow key={rowIndex} className="hover:bg-transparent">
                  {row.map((value, colIndex) => (
                    <TableCell
                      key={`${rowIndex}-${colIndex}`}
                      className={`px-2 text-center text-xs ${cellClass(columns[colIndex].section)} ${
                        colIndex === 2 || colIndex === 8 ? "max-w-[9rem] truncate" : ""
                      } ${colIndex === 9 ? "max-w-[12rem] truncate" : ""}`}
                    >
                      {value || "—"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted-foreground">{hr.upload.formatExample.note}</p>
      </CardContent>
    </Card>
  );
}
