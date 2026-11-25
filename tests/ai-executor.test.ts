import { beforeEach, describe, expect, it, vi } from "vitest";

const { accountFindMany, createTransaction, updateTransaction } = vi.hoisted(() => ({
  accountFindMany: vi.fn(),
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { account: { findMany: accountFindMany } },
}));

vi.mock("@/lib/services/transactions", () => ({
  createTransaction,
  updateTransaction,
  getCurrentBalance: vi.fn(),
}));

import { executeIntent } from "@/lib/ai/executor";

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
