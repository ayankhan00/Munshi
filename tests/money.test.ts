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

  it("parses decimal strings without float rounding", () => {
    expect(toMinor("1,234.56")).toBe(123456);
    expect(toMinor("0.07")).toBe(7);
    expect(() => toMinor(1.005)).toThrow("Invalid amount");
    expect(() => toMinor("1.005")).toThrow("Invalid amount");
  });

  it("accepts the largest Int-backed amount and rejects larger ones", () => {
    expect(toMinor(21474836.47)).toBe(2147483647);
    expect(() => toMinor(21474836.48)).toThrow("Amount too large");
    expect(() => toMinor("21474836.48")).toThrow("Amount too large");
  });
});
