import { extractAmount } from "@/lib/money";
import { resolveCategoryFromText } from "@/lib/categories";
import type { ParsedIntent } from "./types";

const EXPENSE_WORDS = ["expense", "spent", "spend", "paid", "bought", "purchase", "buy", "kharcha", "خرچ"];
const INCOME_WORDS = ["income", "earned", "received", "rekha", "آمد", "deposit", "credited", "salary aya"];

export function findAmount(text: string): number | undefined {
  const n = extractAmount(text);
  return n === null ? undefined : n;
}

export function parseIntent(raw: string): ParsedIntent {
  const text = raw.trim();
  const lower = text.toLowerCase();

  if (/\b(help|menu|what can you do|kya kar sakte ho|مدد)\b/.test(lower)) {
    return { kind: "help", raw };
  }

  if (/\b(balance|total money|kitna hai|pesay|پیسے|kitni raqam)\b/.test(lower)) {
    return { kind: "query_balance", raw };
  }

  const hasTransfer = /\b(transfer|move|send|shift)\b/.test(lower);

  if (hasTransfer && /\b(from|to|into)\b/.test(lower)) {
    return parseTransfer(text);
  }

  if (/\b(remind|reminder|yaad|یاد)\b/.test(lower)) {
    return parseReminder(text);
  }

  const EXPENSE_QUERY_WORDS = /\b(how much|kitna kharcha|qitna|kya expenses)\b/;

  if (/\btasks?\b|\btodo\b|do this|to-do/.test(lower)) {
    return parseTask(text);
  }

  if (EXPENSE_QUERY_WORDS.test(lower) && /\b(spend|spent|kharcha|خرچ)\b/.test(lower)) {
    return { kind: "query_spending", raw };
  }

  if (/\b(how much.*(earn|income)|kitni income|آمد)\b/.test(lower)) {
    return { kind: "query_income", raw };
  }

  const hasExpenseWord = EXPENSE_WORDS.some((w) => lower.includes(w));
  const hasIncomeWord = INCOME_WORDS.some((w) => lower.includes(w));
  const amount = findAmount(text);

  if (hasIncomeWord && amount !== undefined) {
    return parseExpenseLike(text, "income");
  }

  if (hasExpenseWord && amount !== undefined) {
    return parseExpenseLike(text, "expense");
  }

  if (/\b(spend|spent|kharcha|خرچ)\b/.test(lower)) {
    return { kind: "query_spending", raw };
  }

  if (hasIncomeWord) {
    if (amount !== undefined) return parseExpenseLike(text, "income");
    return { kind: "query_income", raw };
  }

  if (hasExpenseWord || amount !== undefined) {
    return parseExpenseLike(text, "expense");
  }

  if (/\b(create|add|new|ban|بن)\b/.test(lower)) {
    return parseTask(text);
  }

  return { kind: "unknown", raw };
}

function stripCurrency(text: string): string {
  return text
    .replace(/\b(rs|pkr|rupees?)\b\.?/gi, "")
    .replace(/[₨₹]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseExpenseLike(text: string, kind: "expense" | "income"): ParsedIntent {
  const amount = findAmount(text);
  const withoutAmount = stripCurrency(text);
  const category = resolveCategoryFromText(withoutAmount, kind);
  const description = withoutAmount
    .replace(/\b(expense|spent|spend|paid|bought|purchase|income|earned|received|deposit|add|record|log|new|today|yesterday|tomorrow|for|on|in|i|me|my)\b/gi, "")
    .replace(/[0-9.,]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const dateMatch = withoutAmount.match(/\b(today|yesterday|tomorrow)\b/i);

  if (kind === "income") {
    return {
      kind: "create_income",
      raw: text,
      amount,
      categoryName: category?.name,
      description: description || category?.name || "Income",
      date: dateMatch?.[1].toLowerCase(),
    };
  }

  return {
    kind: "create_expense",
    raw: text,
    amount,
    categoryName: category?.name,
    description: description || category?.name || "Expense",
    date: dateMatch?.[1].toLowerCase(),
    priority: /\b(important|urgent|high)\b/i.test(text) ? "high" : undefined,
  };
}

function parseTask(text: string): ParsedIntent {
  const lower = text.toLowerCase();
  const taskMatch = lower.match(/\b(?:task|todo|to-do)\b\s*[:]?\s*([a-z0-9 ]+)/i);
  const createMatch = lower.match(/\b(?:create|add|new)\b\s+(?:a\s+)?(?:task|todo)?\s*[:]?\s*([a-z0-9 ]+)/i);

  let title = taskMatch?.[1]?.trim() || createMatch?.[1]?.trim() || "";

  if (!title) {
    const cleaned = lower
      .replace(/\b(create|add|new|task|todo|do this|kamm)\b/gi, "")
      .replace(/\b(today|tomorrow|by|at|for|on|before)\b.*/gi, "")
      .replace(/\b(high|urgent|medium|low|priority)\b/gi, "")
      .replace(/[0-9.,]+/g, "")
      .trim();
    title = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  if (!title) return { kind: "unknown", raw: text };

  const dueMatch = text.match(
    /(?:by|before|at|on|due|for)\s+(today|tomorrow|yesterday|[a-z]+\s\d{1,2}(?:st|nd|rd|th)?|\d{1,2}\/[a-z]+\/\d{2,4}|[0-9:\sapm]+)/i,
  );

  const priority = /\b(urgent|high)\b/i.test(text)
    ? "high"
    : /\b(low)\b/i.test(text)
      ? "low"
      : undefined;

  return {
    kind: "create_task",
    raw: text,
    title,
    due: dueMatch?.[1]?.trim(),
    priority,
  };
}

function parseReminder(text: string): ParsedIntent {
  const lower = text.toLowerCase();
  const reminderMatch = lower.match(/\b(?:remind me|reminder|yaad)\b\s*(?:to|about|of)?\s*:?\s*([a-z0-9 ]+)/i);

  let title = reminderMatch?.[1]?.trim() || "";
  title = title
    .replace(/\s+(at|tomorrow|today|next|in|by|on|for|this)\s+.*$/g, "")
    .trim();
  if (!title) {
    const cleaned = lower
      .replace(/\b(remind me|reminder|yaad|to|about|of)\b/gi, "")
      .replace(/\b(at|on|tomorrow|today|next|in)\b.*/gi, "")
      .trim();
    title = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  if (!title) return { kind: "unknown", raw: text };

  const remindMatch = text.match(
    /(?:at|on|tomorrow|today|next|in|by)\s+([^;,.]+)/i,
  );

  return {
    kind: "create_reminder",
    raw: text,
    title,
    remind: remindMatch?.[1]?.trim(),
  };
}

function parseTransfer(text: string): ParsedIntent {
  const amount = findAmount(text);
  const lower = text.toLowerCase();
  const fromMatch = lower.match(/\bfrom\s+([a-z ]+?)\s+(?:to|into)\b/i);
  const toMatch = lower.match(/\b(?:to|into)\s+([a-z ]+)$/i);
  return {
    kind: "create_transfer",
    raw: text,
    amount,
    fromAccount: fromMatch?.[1]?.trim(),
    toAccount: toMatch?.[1]?.trim(),
  };
}