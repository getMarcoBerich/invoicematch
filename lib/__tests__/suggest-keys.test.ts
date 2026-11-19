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

  it("suggests a key when the only difference is diacritics or dots", () => {
    const suggestions = suggestPayerKeys([
      { name: "Arheoloski muzej u Zagrebu", payerKey: "ARHEOLOSKI MUZEJ U ZAGREBU", isCustomKey: false },
      { name: "ARHEOLOŠKI MUZEJ U ZAGREBU", payerKey: "ARHEOLOŠKI MUZEJ U ZAGREBU", isCustomKey: false },
      { name: "PGP d.o.o.", payerKey: "PGP D.O.O.", isCustomKey: false },
      { name: "P.G.P. D.O.O.", payerKey: "P.G.P. D.O.O.", isCustomKey: false },
    ]);

    expect(suggestions.map((suggestion) => suggestion.clients.sort())).toEqual([
      ["ARHEOLOŠKI MUZEJ U ZAGREBU", "Arheoloski muzej u Zagrebu"],
      ["P.G.P. D.O.O.", "PGP d.o.o."],
    ]);
  });

  it("does not chain unrelated companies through legal filler words", () => {
    const suggestions = suggestPayerKeys(
      [
        "Entrio tehnologije d.o.o.",
        "SEMOS CLOUD d.o.o.",
        "Era Euforija d.o.o.",
        "Tuttoluxo d.o.o.",
        "ENTRIO TEHNOLOGIJE d.o.o. za usluge, turistička agencija",
        "Era Euforija d.o.o. za usluge",
        "SEMOS CLOUD d.o.o. za usluge",
        "TUTTOLUXO d.o.o. za trgovinu i usluge",
        "RAGUSINA TRAVEL D.O.O. TURISTIČKA AGENCIJA",
      ].map((name) => ({ name, payerKey: name.toUpperCase(), isCustomKey: false })),
    );

    expect(suggestions.map((suggestion) => suggestion.clients)).toEqual([
      ["Entrio tehnologije d.o.o.", "ENTRIO TEHNOLOGIJE d.o.o. za usluge, turistička agencija"],
      ["Era Euforija d.o.o.", "Era Euforija d.o.o. za usluge"],
      ["SEMOS CLOUD d.o.o.", "SEMOS CLOUD d.o.o. za usluge"],
      ["Tuttoluxo d.o.o.", "TUTTOLUXO d.o.o. za trgovinu i usluge"],
    ]);
    expect(suggestions.map((suggestion) => suggestion.payerKey)).toEqual([
      "ENTRIO",
      "EUFORIJA",
      "SEMOS",
      "TUTTOLUXO",
    ]);
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
