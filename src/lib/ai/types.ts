export type IntentKind =
  | "create_expense"
  | "create_income"
  | "create_transfer"
  | "query_balance"
  | "query_spending"
  | "query_income"
  | "query_list"
  | "query_breakdown"
  | "query_top"
  | "create_task"
  | "create_reminder"
  | "update_transaction"
  | "help"
  | "unknown";

export interface BaseIntent {
  kind: IntentKind;
  raw: string;
}

export interface CreateExpenseIntent extends BaseIntent {
  kind: "create_expense";
  amount?: number;
  categoryName?: string;
  description?: string;
  date?: string;
}

export interface CreateIncomeIntent extends BaseIntent {
  kind: "create_income";
  amount?: number;
  categoryName?: string;
  description?: string;
  date?: string;
}

export interface CreateTransferIntent extends BaseIntent {
  kind: "create_transfer";
  amount?: number;
  fromAccount?: string;
  toAccount?: string;
}

export interface QueryBalanceIntent extends BaseIntent {
  kind: "query_balance";
}

export type QueryPeriod =
  | "this_month"
  | "last_month"
  | "last_week"
  | "last_3_days"
  | "last_30_days";

export interface QuerySpendingIntent extends BaseIntent {
  kind: "query_spending" | "query_income";
  period?: QueryPeriod;
}

export interface QueryListIntent extends BaseIntent {
  kind: "query_list";
  itemType?: "expense" | "income" | "all";
  limit?: number;
}

export interface QueryBreakdownIntent extends BaseIntent {
  kind: "query_breakdown";
  period?: QueryPeriod;
}

export interface QueryTopIntent extends BaseIntent {
  kind: "query_top";
  period?: QueryPeriod;
  limit?: number;
}

export interface ChatTable {
  columns?: string[];
  rows: {
    date: string;
    category: string;
    description: string;
    amount: string;
    type: "expense" | "income" | "transfer";
    share?: number;
  }[];
}

export interface CreateTaskIntent extends BaseIntent {
  kind: "create_task";
  title?: string;
  due?: string;
  priority?: string;
}

export interface CreateReminderIntent extends BaseIntent {
  kind: "create_reminder";
  title?: string;
  remindAt?: string;
  remind?: string;
}

export interface UpdateTransactionIntent extends BaseIntent {
  kind: "update_transaction";
  targetTransactionId?: string;
  amount?: number;
  categoryName?: string;
  description?: string;
  date?: string;
}

export interface HelpIntent extends BaseIntent {
  kind: "help";
}

export interface UnknownIntent extends BaseIntent {
  kind: "unknown";
}

export type ParsedIntent =
  | CreateExpenseIntent
  | CreateIncomeIntent
  | CreateTransferIntent
  | QueryBalanceIntent
  | QuerySpendingIntent
  | QueryListIntent
  | QueryBreakdownIntent
  | QueryTopIntent
  | CreateTaskIntent
  | CreateReminderIntent
  | UpdateTransactionIntent
  | HelpIntent
  | UnknownIntent;