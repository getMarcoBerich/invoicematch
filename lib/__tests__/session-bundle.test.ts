import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { buildClientLedgers } from "@/lib/ledger";
import { clearAllData } from "@/lib/storage/db";
import { importExcelFile, getSessionRecords } from "@/lib/services/session";
import { buildSessionBundle, importSessionBundle } from "@/lib/services/session-bundle";
import { defaultFilters } from "@/components/filter-panel";
import type { RecordRow } from "@/lib/types";
import fs from "fs";
import path from "path";

describe("session bundle", () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it("round-trips invoices, payments and payer keys", async () => {
    const buffer = fs.readFileSync(path.join(process.cwd(), "za json.xlsx"));
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const imported = await importExcelFile("za json.xlsx", arrayBuffer);
    const bundle = await buildSessionBundle([imported.sessionId]);
    await clearAllData();
    const ids = await importSessionBundle(bundle);
    const restored = await getSessionRecords(ids[0]);
    expect(restored.stats.totalInvoices).toBe(imported.invoiceCount);
    expect(restored.stats.totalPayments).toBe(imported.paymentCount);
    expect(restored.session.name).toBe(imported.name);
  });
});

describe("open items on a ledger", () => {
  it("counts days an unpaid invoice has been open", () => {
    const row: RecordRow = {
      matchId: null,
      matchStatus: "unmatched",
      confidence: null,
      matchReasons: null,
      invoice: {
        id: "inv-1",
        invoiceNumber: "1/2026",
        invoiceDate: "2026-01-01",
        client: "Klijent A",
        baseAmount: 100,
        vat: 0,
        total: 100,
        openAmount: 100,
      },
      payment: null,
    };
    const [ledger] = buildClientLedgers([row], defaultFilters, new Map(), "2026-01-11");
    expect(ledger.lines[0].openAmount).toBe(100);
    expect(ledger.lines[0].daysOpen).toBe(10);
  });
});
