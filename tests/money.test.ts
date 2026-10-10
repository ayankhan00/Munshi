import { toMinor, formatMoney } from "@/lib/money";

describe("money", () => {
  it("converts to minor units", () => {
    expect(toMinor(2000)).toBe(200000);
  });

  it("formats currency", () => {
    expect(formatMoney(150000, "PKR")).toContain("1,500");
  });
});
