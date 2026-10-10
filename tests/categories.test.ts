import { describe, it, expect } from "vitest";
import { resolveCategoryFromText } from "@/lib/categories";

describe("category classifier", () => {
  it("maps food/drink keywords", () => {
    expect(resolveCategoryFromText("1200 for coffee", "expense")?.name).toBe("Food/Drink");
    expect(resolveCategoryFromText("1500 for pasta", "expense")?.name).toBe("Food/Drink");
    expect(resolveCategoryFromText("500 for biryani", "expense")?.name).toBe("Food/Drink");
  });

  it("maps groceries", () => {
    expect(resolveCategoryFromText("2000 for groceries", "expense")?.name).toBe("Groceries");
    expect(resolveCategoryFromText("kiryana", "expense")?.name).toBe("Groceries");
  });

  it("handles typos via fuzzy matching", () => {
    expect(resolveCategoryFromText("3000 for internt", "expense")?.name).toBe("Internet");
    expect(resolveCategoryFromText("dinner at restaurent", "expense")?.name).toBe("Food/Drink");
    expect(resolveCategoryFromText("groceris", "expense")?.name).toBe("Groceries");
    expect(resolveCategoryFromText("petorl", "expense")?.name).toBe("Fuel");
  });

  it("maps ride-hailing to Taxi (Tax category removed)", () => {
    expect(resolveCategoryFromText("2000 for uber", "expense")?.name).toBe("Taxi");
    expect(resolveCategoryFromText("fare for taxi", "expense")?.name).toBe("Taxi");
    expect(resolveCategoryFromText("paid income tax", "expense")).toBeNull();
  });

  it("maps bills, internet and fuel", () => {
    expect(resolveCategoryFromText("electricity bill", "expense")?.name).toBe("Utility Bills");
    expect(resolveCategoryFromText("wifi bill", "expense")?.name).toBe("Internet");
    expect(resolveCategoryFromText("filled petrol", "expense")?.name).toBe("Fuel");
  });

  it("maps health, education and transport", () => {
    expect(resolveCategoryFromText("doctor visit", "expense")?.name).toBe("Health Care");
    expect(resolveCategoryFromText("school fee", "expense")?.name).toBe("Education");
    expect(resolveCategoryFromText("rickshaw fare", "expense")?.name).toBe("Taxi");
  });

  it("is kind-aware for overlapping names like Gift", () => {
    expect(resolveCategoryFromText("gift", "expense")?.kind).toBe("expense");
    expect(resolveCategoryFromText("gift", "income")?.kind).toBe("income");
  });

  it("maps income keywords", () => {
    expect(resolveCategoryFromText("received salary", "income")?.name).toBe("Salary");
    expect(resolveCategoryFromText("freelance project", "income")?.name).toBe("Freelance");
  });

  it("returns null for unrelated text", () => {
    expect(resolveCategoryFromText("asdf qwerty", "expense")).toBeNull();
  });
});
