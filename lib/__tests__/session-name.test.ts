import { describe, expect, it } from "vitest";
import { defaultSessionName, getSessionDisplayName } from "@/lib/session-name";

describe("session name helpers", () => {
  it("strips excel extension from filename", () => {
    expect(defaultSessionName("kartica.xlsx")).toBe("kartica");
    expect(defaultSessionName("KARTICA.XLSX")).toBe("KARTICA");
  });

  it("prefers custom name over filename", () => {
    expect(getSessionDisplayName({ name: "Siječanj 2026", filename: "kartica.xlsx" })).toBe(
      "Siječanj 2026",
    );
  });

  it("falls back to filename without extension", () => {
    expect(getSessionDisplayName({ name: "", filename: "kartica.xlsx" })).toBe("kartica");
  });
});
