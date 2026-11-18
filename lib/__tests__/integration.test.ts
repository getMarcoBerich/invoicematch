import "fake-indexeddb/auto";
import { describe, expect, it, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { importExcelFile, getSessionRecords } from "@/lib/services/session";
import { runAutoMatch, unlinkAllMatches } from "@/lib/matching/engine";
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
    const unique = [
      ...new Set(afterMatch.records.flatMap((record) => (record.matchId ? [record.matchId] : []))),
    ];
    expect(unique).toHaveLength(matchResult.created);

    await unlinkAllMatches(result.sessionId, unique.slice(0, 1));
    const afterOne = await getSessionRecords(result.sessionId);
    expect(afterOne.stats.matched).toBe(matchResult.created - 1);

    await unlinkAllMatches(result.sessionId, unique.slice(1));
    const afterUnlink = await getSessionRecords(result.sessionId);
    expect(afterUnlink.stats.matched).toBe(0);
    expect(afterUnlink.stats.totalInvoices).toBe(6);
    expect(afterUnlink.stats.totalPayments).toBe(6);
  });
});
