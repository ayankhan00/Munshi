import { describe, it, expect, afterAll } from "vitest";
import { makeUser, cleanupUsers, expenseCategory, prisma } from "./helpers";
import {
  setBudget,
  listBudgets,
  deleteBudget,
  monthlyBudgetWarnings,
} from "@/lib/services/budgets";
import { createTransaction } from "@/lib/services/transactions";
import { currentMonthKey } from "@/lib/dates";

const createdUserIds: string[] = [];
async function user() {
  const u = await makeUser();
  createdUserIds.push(u.id);
  return u;
}

afterAll(async () => {
  await cleanupUsers(createdUserIds);
});

const TZ = "Asia/Karachi";
const PERIOD = "2030-01";

describe("budgets service", () => {
  it("upserts a category budget instead of creating duplicates", async () => {
    const u = await user();
    const cat = await expenseCategory(u.id, "Food/Drink");

    await setBudget(u.id, { categoryId: cat.id, amount: 5000, period: PERIOD });
    await setBudget(u.id, { categoryId: cat.id, amount: 7000, period: PERIOD });

    const { rows } = await listBudgets(u.id, TZ, 1, PERIOD);
    const matching = rows.filter((r) => r.categoryId === cat.id);
    expect(matching).toHaveLength(1);
    expect(matching[0].amountMinor).toBe(700_000);
  });

  it("aggregates spent, remaining and percent for a category budget", async () => {
    const u = await user();
    const cat = await expenseCategory(u.id, "Food/Drink");

    await setBudget(u.id, { categoryId: cat.id, amount: 1000, period: PERIOD });
    await createTransaction(u.id, {
      type: "expense",
      amount: 400,
      categoryId: cat.id,
      date: "2030-01-05",
    });
    await createTransaction(u.id, {
      type: "expense",
      amount: 100,
      description: "misc",
      date: "2030-01-06",
    });

    const { rows } = await listBudgets(u.id, TZ, 1, PERIOD);
    const b = rows.find((r) => r.categoryId === cat.id)!;
    expect(b.spentMinor).toBe(40_000);
    expect(b.remainingMinor).toBe(60_000);
    expect(b.overspentMinor).toBe(0);
    expect(b.percentUsed).toBe(40);
  });

  it("counts every expense in the period for an overall budget", async () => {
    const u = await user();
    const cat = await expenseCategory(u.id, "Food/Drink");

    await setBudget(u.id, { amount: 2000, period: PERIOD });
    await createTransaction(u.id, { type: "expense", amount: 300, categoryId: cat.id, date: "2030-01-03" });
    await createTransaction(u.id, { type: "expense", amount: 200, description: "snacks", date: "2030-01-04" });
    await createTransaction(u.id, { type: "income", amount: 9999, date: "2030-01-04" });

    const { rows } = await listBudgets(u.id, TZ, 1, PERIOD);
    const overall = rows.find((r) => r.categoryId === null)!;
    expect(overall.spentMinor).toBe(50_000);
    expect(overall.percentUsed).toBe(25);
  });

  it("ignores expenses outside the period and deleted transactions", async () => {
    const u = await user();
    const cat = await expenseCategory(u.id, "Food/Drink");
    await setBudget(u.id, { categoryId: cat.id, amount: 1000, period: PERIOD });

    await createTransaction(u.id, { type: "expense", amount: 500, categoryId: cat.id, date: "2030-02-01" });
    const kept = await createTransaction(u.id, {
      type: "expense",
      amount: 250,
      categoryId: cat.id,
      date: "2030-01-15",
    });
    await prisma.transaction.update({
      where: { id: kept.transaction.id },
      data: { deletedAt: new Date() },
    });

    const { rows } = await listBudgets(u.id, TZ, 1, PERIOD);
    const b = rows.find((r) => r.categoryId === cat.id)!;
    expect(b.spentMinor).toBe(0);
  });

  it("reports overspending and raises warnings at or above 80%", async () => {
    const u = await user();
    const cat = await expenseCategory(u.id, "Food/Drink");
    const period = currentMonthKey(TZ);
    await setBudget(u.id, { categoryId: cat.id, amount: 100, period });
    await createTransaction(u.id, {
      type: "expense",
      amount: 150,
      categoryId: cat.id,
      date: `${period}-10`,
    });

    const { rows } = await listBudgets(u.id, TZ, 1, period);
    const b = rows.find((r) => r.categoryId === cat.id)!;
    expect(b.overspentMinor).toBe(50_00);
    expect(b.remainingMinor).toBe(-50_00);
    expect(b.percentUsed).toBe(100);

    const warnings = await monthlyBudgetWarnings(u.id, TZ, 1);
    expect(warnings.map((w) => w.id)).toContain(b.id);
  });

  it("rejects a budget for a category the user does not own", async () => {
    const a = await user();
    const b = await user();
    const cat = await expenseCategory(b.id, "Food/Drink");
    await expect(
      setBudget(a.id, { categoryId: cat.id, amount: 100, period: PERIOD }),
    ).rejects.toThrow(/Category not found/);
  });

  it("deletes a budget and refuses cross-user deletion", async () => {
    const u = await user();
    const other = await user();
    const cat = await expenseCategory(u.id, "Food/Drink");
    const budget = await setBudget(u.id, { categoryId: cat.id, amount: 100, period: PERIOD });

    await expect(deleteBudget(other.id, budget.id)).rejects.toThrow(/not found/);
    await deleteBudget(u.id, budget.id);

    const { rows } = await listBudgets(u.id, TZ, 1, PERIOD);
    expect(rows.find((r) => r.id === budget.id)).toBeUndefined();
  });
});
