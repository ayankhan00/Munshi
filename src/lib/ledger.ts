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

export interface BalanceDelta extends AccountLedger {
  accountId: string;
}

/** Per-account change from one transaction; sign -1 reverses it. */
export function ledgerDeltas(txn: LedgerTxn, sign = 1): BalanceDelta[] {
  if (txn.deletedAt) return [];
  const byAccount = new Map<string, BalanceDelta>();
  const add = (accountId: string, available: number, income: number, expense: number) => {
    const delta = byAccount.get(accountId) ?? {
      accountId,
      availableMinor: 0,
      incomeMinor: 0,
      expenseMinor: 0,
    };
    delta.availableMinor += available;
    delta.incomeMinor += income;
    delta.expenseMinor += expense;
    byAccount.set(accountId, delta);
  };

  switch (txn.type) {
    case "income":
    case "refund":
      add(txn.accountId, txn.amountMinor, txn.amountMinor, 0);
      break;
    case "expense":
      add(txn.accountId, -txn.amountMinor, 0, txn.amountMinor);
      break;
    case "transfer":
      add(txn.accountId, -txn.amountMinor, 0, 0);
      if (txn.transferAccountId) add(txn.transferAccountId, txn.amountMinor, 0, 0);
      break;
    case "adjustment":
      add(txn.accountId, txn.amountMinor, 0, 0);
      break;
  }

  return [...byAccount.values()].map((d) => ({
    ...d,
    availableMinor: d.availableMinor * sign,
    incomeMinor: d.incomeMinor * sign,
    expenseMinor: d.expenseMinor * sign,
  }));
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
