import { describe, expect, it } from "vitest";
import { toCSV } from "@/lib/csv";

const columns = [{ key: "v" as const, header: "v" }];
const cell = (value: unknown, neutralize?: boolean) =>
  toCSV([{ v: value }], columns, { neutralizeFormulas: neutralize }).split("\n")[1];

describe("toCSV, neutralisation des formules", () => {
  it.each([
    ['=HYPERLINK("x")', `"'=HYPERLINK(""x"")"`],
    ["+1", "'+1"],
    ["-1", "'-1"],
    ["@a", "'@a"],
    ["\tx", "'\tx"],
    ["\rx", `"'\rx"`],
  ])("préfixe %j d'une apostrophe avec l'option", (input, expected) => {
    expect(cell(input, true)).toBe(expected);
  });

  it.each(["=1+1", "+1", "-1", "@a", "\tx"])("laisse %j inchangé sans l'option", (input) => {
    expect(cell(input)).toBe(input);
    expect(cell(input, false)).toBe(input);
  });

  it("ne touche ni aux textes ordinaires ni aux nombres", () => {
    expect(cell("Ministre", true)).toBe("Ministre");
    expect(cell("2024-01-08", true)).toBe("2024-01-08");
    expect(cell(-5, true)).toBe("-5");
    expect(cell(null, true)).toBe("");
  });
});
