import { csvEscape, toCsv } from "@/lib/csv";

describe("csvEscape", () => {
  it("neutralizes formula injection in string cells", () => {
    const formula = '=HYPERLINK("http://evil","click")';
    expect(csvEscape(formula)).toBe(`"'=HYPERLINK(""http://evil"",""click"")"`);
    expect(toCsv(["description"], [[formula]])).toBe(
      `description\r\n"'=HYPERLINK(""http://evil"",""click"")"`,
    );
    expect(csvEscape("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvEscape("\tpayload")).toBe("'\tpayload");
  });

  it("leaves normal values and numbers unchanged", () => {
    expect(csvEscape("Groceries")).toBe("Groceries");
    expect(csvEscape("milk, eggs")).toBe('"milk, eggs"');
    expect(csvEscape(42)).toBe("42");
    expect(csvEscape(-7)).toBe("-7");
    expect(csvEscape(null)).toBe("");
  });
});
