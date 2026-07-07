import { describe, expect, it } from "vitest";
import { parseAmount } from "@/lib/excel/normalize";

describe("parseAmount", () => {
  it("parses Croatian formatted amounts", () => {
    expect(parseAmount("1.000,00")).toBe(1000);
    expect(parseAmount("500,00")).toBe(500);
    expect(parseAmount("12.345,67")).toBe(12345.67);
  });

  it("parses plain numbers", () => {
    expect(parseAmount(1000)).toBe(1000);
    expect(parseAmount("1000.50")).toBe(1000.5);
  });

  it("returns null for empty values", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount(null)).toBeNull();
  });
});
