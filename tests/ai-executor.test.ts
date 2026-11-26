import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  accountFindMany,
  transactionFindMany,
  createTransaction,
  updateTransaction,
  categoryBreakdownForRange,
  topExpenses,
} = vi.hoisted(() => ({
  accountFindMany: vi.fn(),
  transactionFindMany: vi.fn(),
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  categoryBreakdownForRange: vi.fn(),
  topExpenses: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    account: { findMany: accountFindMany },
    transaction: { findMany: transactionFindMany },
  },
}));

vi.mock("@/lib/services/transactions", () => ({
  createTransaction,
  updateTransaction,
  getCurrentBalance: vi.fn(),
}));

vi.mock("@/lib/services/reports", () => ({ categoryBreakdownForRange, topExpenses }));

import { executeIntent } from "@/lib/ai/executor";
import { currentMonthKey, monthRange, startOfDayZoned, fnAddDays, dateRange } from "@/lib/dates";

const ctx = { userId: "user-1", timezone: "Asia/Karachi", currency: "PKR" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("amount validation", () => {
  it.each([0.001, 100000000])("rejects %s without writing", async (amount) => {
    const result = await executeIntent(
      { kind: "create_expense", amount, raw: `I spent ${amount}` },
      ctx,
    );
    expect(result.reply).toBe("That amount isn't valid.");
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it("rejects an invalid transfer amount without writing", async () => {
    const result = await executeIntent(
      { kind: "create_transfer", amount: 100000000, raw: "transfer 100000000" },
      ctx,
    );
    expect(result.reply).toBe("That amount isn't valid.");
    expect(createTransaction).not.toHaveBeenCalled();
  });
});

describe("transfer account resolution", () => {
  beforeEach(() => {
    accountFindMany.mockResolvedValue([
      { id: "cash", name: "Cash", isDefault: true, archived: false },
      { id: "bank", name: "Bank", isDefault: false, archived: false },
    ]);
  });

  it("does not write when a named destination is not an owned account", async () => {
    const result = await executeIntent(
      {
        kind: "create_transfer",
        amount: 500,
        fromAccount: "Cash",
        toAccount: "Ahmed",
        raw: "send 500 from Cash to Ahmed",
      },
      ctx,
    );
    expect(result.reply).toBe("Which account?");
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it("does not write when a named source is not an owned account", async () => {
    const result = await executeIntent(
      {
        kind: "create_transfer",
        amount: 500,
        fromAccount: "Ahmed",
        toAccount: "Bank",
        raw: "send 500 from Ahmed to Bank",
      },
      ctx,
    );
    expect(result.reply).toBe("Which account?");
    expect(createTransaction).not.toHaveBeenCalled();
  });
});

describe("period queries", () => {
  beforeEach(() => {
    categoryBreakdownForRange.mockResolvedValue({
      totalExpenseMinor: 0,
      totalIncomeMinor: 0,
      categories: [],
    });
  });

  it("uses the previous calendar month", async () => {
    await executeIntent({ kind: "query_spending", period: "last_month", raw: "last month" }, ctx);
    const call = categoryBreakdownForRange.mock.calls[0];
    expect(call[3]).toEqual(monthRange(currentMonthKey(ctx.timezone), ctx.timezone).start);
    expect(call[2].getTime()).toBeLessThan(call[3].getTime());
  });

  it("uses a seven-day window for last week", async () => {
    await executeIntent({ kind: "query_spending", period: "last_week", raw: "last week" }, ctx);
    const [, , from, to] = categoryBreakdownForRange.mock.calls[0];
    expect(fnAddDays(from as Date, 7).getTime()).toBe((to as Date).getTime());
  });

  it("includes today plus two prior days for last 3 days", async () => {
    await executeIntent({ kind: "query_spending", period: "last_3_days", raw: "last 3 days" }, ctx);
    const [, , from, to] = categoryBreakdownForRange.mock.calls[0];
    const todayStart = startOfDayZoned(new Date(), ctx.timezone);
    expect(from).toEqual(fnAddDays(todayStart, -2));
    expect(to).toEqual(fnAddDays(todayStart, 1));
  });

  it("uses a trailing 30-day window", async () => {
    await executeIntent({ kind: "query_income", period: "last_30_days", raw: "last 30 days" }, ctx);
    const [, , from, to] = categoryBreakdownForRange.mock.calls[0];
    expect(from).toEqual(fnAddDays(startOfDayZoned(new Date(), ctx.timezone), -29));
    expect(to).toEqual(fnAddDays(startOfDayZoned(new Date(), ctx.timezone), 1));
  });
});

describe("recent transaction lists", () => {
  beforeEach(() => {
    transactionFindMany.mockResolvedValue([
      {
        amountMinor: 50000,
        type: "expense",
        description: "lunch",
        occurredAt: new Date("2026-11-27T10:00:00Z"),
        category: { name: "Food/Drink" },
      },
    ]);
  });

  it("returns table rows filtered by type", async () => {
    const result = await executeIntent(
      { kind: "query_list", itemType: "expense", limit: 3, raw: "last 3 expenses" },
      ctx,
    );
    expect(transactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 3,
        where: expect.objectContaining({ type: "expense" }),
      }),
    );
    expect(result.table?.rows[0]).toMatchObject({
      category: "Food/Drink",
      description: "lunch",
      amount: "Rs 500",
    });
  });

  it("caps the requested count at 20", async () => {
    await executeIntent({ kind: "query_list", limit: 999, raw: "last 999 transactions" }, ctx);
    expect(transactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20, where: expect.objectContaining({ type: { not: "transfer" } }) }),
    );
  });
});

describe("breakdown and top expenses", () => {
  beforeEach(() => {
    categoryBreakdownForRange.mockResolvedValue({
      totalExpenseMinor: 100000,
      totalIncomeMinor: 0,
      categories: [
        { id: null, name: "Food/Drink", color: "#fff", minor: 60000, percent: 60 },
        { id: null, name: "Rent", color: "#000", minor: 40000, percent: 40 },
      ],
    });
    topExpenses.mockResolvedValue([
      {
        amountMinor: 100000,
        occurredAt: new Date("2026-11-27T10:00:00Z"),
        description: "rent",
        category: { name: "Rent" },
      },
      {
        amountMinor: 50000,
        occurredAt: new Date("2026-11-26T10:00:00Z"),
        description: "groceries",
        category: { name: "Groceries" },
      },
    ]);
  });

  it("renders a category breakdown with bars", async () => {
    const result = await executeIntent(
      { kind: "query_breakdown", period: "last_month", raw: "where did my money go last month" },
      ctx,
    );
    expect(result.table?.columns).toEqual(["Category", "Share", "Amount"]);
    expect(result.table?.rows[0]).toMatchObject({
      category: "Food/Drink",
      share: 60,
      amount: "Rs 600",
    });
  });

  it("renders the biggest expenses with relative bars", async () => {
    const result = await executeIntent(
      { kind: "query_top", period: "this_month", limit: 2, raw: "my 2 biggest expenses" },
      ctx,
    );
    expect(topExpenses).toHaveBeenCalledWith(
      ctx.userId,
      expect.any(Date),
      expect.any(Date),
      2,
    );
    expect(result.table?.rows.map((row) => row.share)).toEqual([100, 50]);
  });

  it("uses an explicit range from the message", async () => {
    const expected = dateRange("from 1 nov to 15 nov", ctx.timezone);
    expect(expected).not.toBeNull();
    await executeIntent(
      {
        kind: "query_spending",
        raw: "How much did I spend from 1 nov to 15 nov?",
      },
      ctx,
    );
    const call = categoryBreakdownForRange.mock.calls[0];
    expect(call[2]).toEqual(expected?.from);
    expect(call[3]).toEqual(expected?.toExclusive);
  });
});
