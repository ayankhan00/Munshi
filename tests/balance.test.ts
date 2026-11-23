import { describe, it, expect, afterAll } from "vitest";
import { makeUser, cleanupUsers, prisma } from "./helpers";
import {
  createTransaction,
  deleteTransaction,
  getCurrentBalance,
  updateTransaction,
} from "@/lib/services/transactions";
import { balanceForAccount } from "@/lib/ledger";

const createdUserIds: string[] = [];
async function user() {
  const u = await makeUser();
  createdUserIds.push(u.id);
  return u;
}

afterAll(async () => {
  await cleanupUsers(createdUserIds);
});

describe("running account balances", () => {
  it("tracks income, expense, adjustment and both sides of a transfer", async () => {
    const u = await user();
    const cash = await prisma.account.findFirstOrThrow({ where: { userId: u.id } });
    const bank = await prisma.account.create({
      data: { userId: u.id, name: "Bank", type: "bank", openingBalanceMinor: 5000, availableMinor: 5000 },
    });

    await createTransaction(u.id, { type: "income", amount: 100, date: "2030-05-01" });
    const expense = await createTransaction(u.id, {
      type: "expense",
      amount: 30,
      date: "2030-05-02",
    });
    await createTransaction(u.id, {
      type: "adjustment",
      amount: 5,
      reason: "correction",
      date: "2030-05-03",
    });
    await createTransaction(u.id, {
      type: "transfer",
      amount: 20,
      accountId: cash.id,
      transferAccountId: bank.id,
      date: "2030-05-04",
    });

    const balance = await getCurrentBalance(u.id);
    const cashBalance = balance.accounts.find((b) => b.account.id === cash.id)!;
    const bankBalance = balance.accounts.find((b) => b.account.id === bank.id)!;

    expect(cashBalance).toMatchObject({ availableMinor: 5500, incomeMinor: 10000, expenseMinor: 3000 });
    expect(bankBalance).toMatchObject({ availableMinor: 7000, incomeMinor: 0, expenseMinor: 0 });
    expect(balance.availableMinor).toBe(12500);

    // Stored totals must agree with a fresh scan of the ledger (the backfill rules).
    const txns = await prisma.transaction.findMany({ where: { userId: u.id, deletedAt: null } });
    expect(cashBalance).toMatchObject(balanceForAccount(cash.id, cash.openingBalanceMinor, txns));
    expect(bankBalance).toMatchObject(balanceForAccount(bank.id, bank.openingBalanceMinor, txns));

    await updateTransaction(u.id, expense.transaction.id, { amount: 10 });
    const updated = await getCurrentBalance(u.id);
    expect(updated.accounts.find((b) => b.account.id === cash.id)).toMatchObject({
      availableMinor: 7500,
      expenseMinor: 1000,
    });

    await deleteTransaction(u.id, expense.transaction.id);

    const after = await getCurrentBalance(u.id);
    expect(after.accounts.find((b) => b.account.id === cash.id)).toMatchObject({
      availableMinor: 8500,
      incomeMinor: 10000,
      expenseMinor: 0,
    });
    expect(after.accounts.find((b) => b.account.id === bank.id)!.availableMinor).toBe(7000);
  });
});
