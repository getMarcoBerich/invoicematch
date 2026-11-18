import { describe, expect, it } from "vitest";
import { suggestPayerKeys } from "@/lib/clients/suggest-keys";

describe("suggestPayerKeys", () => {
  it("groups similar unkeyed names and keeps unrelated clients apart", () => {
    const suggestions = suggestPayerKeys([
      { name: "Horwath Consulting Zagreb", payerKey: "HORWATH CONSULTING ZAGREB", isCustomKey: false },
      { name: "Horwath Zagreb d.o.o.", payerKey: "HORWATH ZAGREB D O O", isCustomKey: false },
      { name: "Tehnograd d.o.o.", payerKey: "TEHNOGRAD D O O", isCustomKey: false },
    ]);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].clients).toEqual(["Horwath Consulting Zagreb", "Horwath Zagreb d.o.o."]);
    expect(suggestions[0].payerKey).toBe("HORWATH");
  });

  it("does not suggest a group that already shares a key", () => {
    expect(
      suggestPayerKeys([
        { name: "Horwath Zagreb", payerKey: "HORWATH", isCustomKey: true },
        { name: "Horwath Consulting", payerKey: "HORWATH", isCustomKey: true },
      ]),
    ).toEqual([]);
  });
});
