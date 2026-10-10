export type IntentKind =
  | "create_expense"
  | "create_income"
  | "create_transfer"
  | "query_balance"
  | "query_spending"
  | "query_income"
  | "create_task"
  | "create_reminder"
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
  priority?: string;
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

export interface QuerySpendingIntent extends BaseIntent {
  kind: "query_spending" | "query_income";
  period?: string;
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
  | CreateTaskIntent
  | CreateReminderIntent
  | HelpIntent
  | UnknownIntent;