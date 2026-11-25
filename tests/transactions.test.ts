import { describe, it, expect, afterAll } from "vitest";
import { makeUser, cleanupUsers, prisma } from "./helpers";
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getCurrentBalance,
} from "@/lib/services/transactions";

const createdUserIds: string[] = [];
async function user() {
  const u = await makeUser();
  createdUserIds.push(u.id);
  return u;
}

afterAll(async () => {
  await cleanupUsers(createdUserIds);
});

describe("category resolution when creating a transaction", () => {
  it("maps an AI-invented label onto the seeded category instead of duplicating it", async () => {
    const u = await user();

    // "burger" and "lunch" must land in the same category, not two.
    await createTransaction(u.id, {
      type: "expense",
      amount: 2000,
      categoryName: "Food",
      description: "burger",
      date: "2030-02-01",
    });
    await createTransaction(u.id, {
      type: "expense",
      amount: 500,
      categoryName: "Food/Drink",
      description: "lunch",
      date: "2030-02-01",
    });

    const names = (
      await prisma.category.findMany({
        where: { userId: u.id, kind: "expense" },
        select: { name: true },
      })
    ).map((c) => c.name);

    expect(names).toContain("Food/Drink");
    expect(names).not.toContain("Food");

    const txns = await prisma.transaction.findMany({
      where: { userId: u.id, type: "expense" },
      include: { category: true },
    });
    expect(txns).toHaveLength(2);
    expect(txns.every((t) => t.category?.name === "Food/Drink")).toBe(true);
  });

  it("reuses a genuinely new category case-insensitively", async () => {
    const u = await user();

    await createTransaction(u.id, {
      type: "expense",
      amount: 100,
      categoryName: "Crypto Trading",
      description: "eth topup",
      date: "2030-02-02",
    });
    await createTransaction(u.id, {
      type: "expense",
      amount: 100,
      categoryName: "crypto trading",
      description: "eth topup",
      date: "2030-02-03",
    });

    const cats = await prisma.category.findMany({
      where: { userId: u.id, kind: "expense", name: { equals: "crypto trading", mode: "insensitive" } },
    });
    expect(cats).toHaveLength(1);
  });
});

describe("transaction ownership and refund limits", () => {
  it("cannot retarget a transfer to another user's account", async () => {
    const u = await user();
    const other = await user();
    const ownAccount = await prisma.account.findFirstOrThrow({ where: { userId: u.id } });
    const ownTarget = await prisma.account.create({
      data: { userId: u.id, name: "Bank", type: "bank" },
    });
    const tx = await createTransaction(u.id, {
      type: "transfer",
      amount: 100,
      accountId: ownAccount.id,
      transferAccountId: ownTarget.id,
      date: "2030-03-01",
    });
    const otherAccount = await prisma.account.findFirstOrThrow({ where: { userId: other.id } });

    await expect(
      updateTransaction(u.id, tx.transaction.id, { transferAccountId: otherAccount.id }),
    ).rejects.toThrow("Destination account not found");
  });

  it("does not let two refunds double-credit one expense", async () => {
    const u = await user();
    const expense = await createTransaction(u.id, {
      type: "expense",
      amount: 100,
      description: "original expense",
      date: "2030-04-01",
    });
    await createTransaction(u.id, {
      type: "refund",
      amount: 100,
      sourceTransactionId: expense.transaction.id,
      idempotencyKey: "refund-key-1",
      date: "2030-04-02",
    });

    await expect(
      createTransaction(u.id, {
        type: "refund",
        amount: 100,
        sourceTransactionId: expense.transaction.id,
        idempotencyKey: "refund-key-2",
        date: "2030-04-03",
      }),
    ).rejects.toThrow("Refund cannot exceed the original expense amount");
  });

  it("does not let an update turn a transaction into an uncapped refund", async () => {
    const u = await user();
    const other = await user();
    const expense = await createTransaction(u.id, {
      type: "expense",
      amount: 100,
      date: "2030-05-01",
    });
    await createTransaction(u.id, {
      type: "refund",
      amount: 60,
      sourceTransactionId: expense.transaction.id,
      idempotencyKey: "refund-existing",
      date: "2030-05-02",
    });
    const candidate = await createTransaction(u.id, {
      type: "income",
      amount: 50,
      description: "salary",
      date: "2030-05-03",
    });
    const foreignExpense = await createTransaction(other.id, {
      type: "expense",
      amount: 500,
      date: "2030-05-01",
    });

    await expect(
      updateTransaction(u.id, candidate.transaction.id, {
        type: "refund",
        amount: 100,
        sourceTransactionId: expense.transaction.id,
      }),
    ).rejects.toThrow("Refund cannot exceed the original expense amount");
    await expect(
      updateTransaction(u.id, candidate.transaction.id, {
        type: "refund",
        amount: 10,
        sourceTransactionId: foreignExpense.transaction.id,
      }),
    ).rejects.toThrow("Source expense not found");

    const unchanged = await prisma.transaction.findUniqueOrThrow({
      where: { id: candidate.transaction.id },
    });
    expect(unchanged.type).toBe("income");
    expect(unchanged.amountMinor).toBe(5000);
    expect((await getCurrentBalance(u.id)).availableMinor).toBe(1000);
  });

  it("soft-deletes refunds and reverses their ledger when the source is deleted", async () => {
    const u = await user();
    const expense = await createTransaction(u.id, {
      type: "expense",
      amount: 100,
      date: "2030-06-01",
    });
    const refund = await createTransaction(u.id, {
      type: "refund",
      amount: 60,
      sourceTransactionId: expense.transaction.id,
      idempotencyKey: "refund-cascade",
      date: "2030-06-02",
    });

    const before = await getCurrentBalance(u.id);
    expect(before.availableMinor).toBe(-4000);
    expect(before.accounts[0].incomeMinor).toBe(6000);
    expect(before.accounts[0].expenseMinor).toBe(10000);

    await deleteTransaction(u.id, expense.transaction.id);

    const source = await prisma.transaction.findUniqueOrThrow({
      where: { id: expense.transaction.id },
    });
    const refundRow = await prisma.transaction.findUniqueOrThrow({
      where: { id: refund.transaction.id },
    });
    expect(source.deletedAt).not.toBeNull();
    expect(refundRow.deletedAt).not.toBeNull();
    expect(
      await prisma.transaction.count({
        where: {
          userId: u.id,
          type: "refund",
          sourceTransactionId: expense.transaction.id,
          deletedAt: null,
        },
      }),
    ).toBe(0);

    const after = await getCurrentBalance(u.id);
    expect(after.availableMinor).toBe(0);
    expect(after.accounts[0].incomeMinor).toBe(0);
    expect(after.accounts[0].expenseMinor).toBe(0);
  });
});
