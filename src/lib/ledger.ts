export interface LedgerTxn {
  type: string;
  amountMinor: number;
  accountId: string;
  transferAccountId?: string | null;
  deletedAt?: Date | null;
}

export interface AccountLedger {
  availableMinor: number;
  incomeMinor: number;
  expenseMinor: number;
}

export function balanceForAccount(
  accountId: string,
  openingMinor: number,
  txns: LedgerTxn[],
): AccountLedger {
  let balance = openingMinor;
  let income = 0;
  let expense = 0;

  for (const t of txns) {
    if (t.deletedAt) continue;
    const isSource = t.accountId === accountId;
    const isTarget = t.transferAccountId === accountId;

    switch (t.type) {
      case "income":
        if (isSource) {
          income += t.amountMinor;
          balance += t.amountMinor;
        }
        break;
      case "refund":
        if (isSource) {
          income += t.amountMinor;
          balance += t.amountMinor;
        }
        break;
      case "expense":
        if (isSource) {
          expense += t.amountMinor;
          balance -= t.amountMinor;
        }
        break;
      case "transfer":
        if (isSource) balance -= t.amountMinor;
        if (isTarget) balance += t.amountMinor;
        break;
      case "adjustment":
        if (isSource) balance += t.amountMinor;
        break;
    }
  }
  return { availableMinor: balance, incomeMinor: income, expenseMinor: expense };
}

export interface UserTotals {
  incomeMinor: number;
  expenseMinor: number;
  availableMinor: number;
  openingMinor: number;
}

export function userTotals(
  accounts: {
    id: string;
    openingBalanceMinor: number;
  }[],
  txns: LedgerTxn[],
): UserTotals {
  let opening = 0;
  let income = 0;
  let expense = 0;
  for (const a of accounts) opening += a.openingBalanceMinor;
  for (const t of txns) {
    if (t.deletedAt) continue;
    switch (t.type) {
      case "income":
      case "refund":
        income += t.amountMinor;
        opening += t.amountMinor && 0;
        break;
      case "expense":
        expense += t.amountMinor;
        break;
    }
  }
  const perAccount = accounts.map((a) =>
    balanceForAccount(a.id, a.openingBalanceMinor, txns),
  );
  const available = perAccount.reduce((sum, x) => sum + x.availableMinor, 0);
  return { openingMinor: opening, incomeMinor: income, expenseMinor: expense, availableMinor: available };
}