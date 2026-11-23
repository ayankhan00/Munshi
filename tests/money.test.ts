import { toMinor, formatMoney } from "@/lib/money";

describe("money", () => {
  it("converts to minor units", () => {
    expect(toMinor(2000)).toBe(200000);
  });

  it("formats currency", () => {
    expect(formatMoney(150000, "PKR")).toContain("1,500");
  });

  it("rejects non-positive and invalid amounts", () => {
    expect(() => toMinor(-100)).toThrow("Invalid amount");
    expect(() => toMinor(0)).toThrow("Invalid amount");
    expect(() => toMinor(NaN)).toThrow("Invalid amount");
  });
});
