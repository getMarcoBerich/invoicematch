import "fake-indexeddb/auto";
import { describe, expect, it, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { importExcelFile, getSessionRecords } from "@/lib/services/session";
import { runAutoMatch } from "@/lib/matching/engine";
import { clearAllData } from "@/lib/storage/db";

describe("Import integration", () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it("imports sample file without auto-matching until requested", async () => {
    const buffer = fs.readFileSync(path.join(process.cwd(), "za json.xlsx"));
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
    const result = await importExcelFile("za json.xlsx", arrayBuffer);

    expect(result.invoiceCount).toBe(6);
    expect(result.paymentCount).toBe(6);

    const session = await getSessionRecords(result.sessionId);
    expect(session.stats.totalInvoices).toBe(6);
    expect(session.stats.totalPayments).toBe(6);
    expect(session.stats.matched).toBe(0);

    const matchResult = await runAutoMatch(result.sessionId);
    expect(matchResult.created).toBeGreaterThan(0);

    const afterMatch = await getSessionRecords(result.sessionId);
    expect(afterMatch.stats.matched).toBe(matchResult.created);
  });
});
