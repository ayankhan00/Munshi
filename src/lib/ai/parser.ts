import { extractAmount } from "@/lib/money";
import { resolveCategoryFromText } from "@/lib/categories";
import type { ParsedIntent } from "./types";

const EXPENSE_WORDS = [
  "expense",
  "spent",
  "spend",
  "spending",
  "paid",
  "pay",
  "bought",
  "buy",
  "purchase",
  "purchased",
  "gave",
  "give",
  "given",
  "gifted",
  "donated",
  "lent",
  "lend",
  "kharcha",
  "kharch",
  "خرچ",
  "ادا",
  "بهیجا",
  "بھیجا",
];

const INCOME_WORDS = [
  "income",
  "earned",
  "earn",
  "earning",
  "received",
  "receive",
  "receiving",
  "got",
  "gotten",
  "credit",
  "credited",
  "deposit",
  "deposited",
  "salary",
  "mila",
  "milay",
  "miley",
  "mili",
  "aya",
  "aayi",
  "aagaya",
  "aa gaya",
  "rekha",
  "آمد",
  "وصول",
  "حاصل",
  "آمدنی",
];

// Words that carry no meaning once we build a transaction description.
const DESCRIPTION_STOPWORDS =
  /\b(expense|spent|spend|spending|paid|pay|bought|buy|purchase|purchased|income|earned|earn|earning|received|receive|receiving|got|gotten|credit|credited|deposit|deposited|salary|gave|give|given|gifted|donated|lent|lend|add|added|record|recorded|log|logged|new|today|yesterday|tomorrow|for|from|to|on|in|into|at|by|of|the|a|an|i|me|my|actually|instead|mean|make|made|more|it|was|is|that|this|no|not|rather|correction|correct|change|changed|update|updated|same|also|too|as|well|one)\b/gi;

function matchWord(lower: string, word: string): boolean {
  if (/^[a-z0-9 ]+$/.test(word)) {
    return new RegExp(`\\b${word.replace(/ /g, "\\s+")}\\b`, "i").test(lower);
  }
  return lower.includes(word);
}

export function hasAnyWord(lower: string, words: string[]): boolean {
  return words.some((w) => matchWord(lower, w));
}

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

  const hasExpenseWord = hasAnyWord(lower, EXPENSE_WORDS);
  const hasIncomeWord = hasAnyWord(lower, INCOME_WORDS);
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
    .replace(DESCRIPTION_STOPWORDS, "")
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

export interface ChatHistoryTurn {
  role: "user" | "assistant";
  content: string;
  intent?: string;
}

// Phrases that signal the message is modifying the previous transaction
// ("make it 600", "actually that was income", "no, from Ahmed instead").
const REFERENTIAL =
  /\b(actually|instead|i mean|make it|change (it )?to|rather|correction|correct it|not|no|same|also|too|as well|that one|the last one)\b/i;

function lastTransactionMessage(history: ChatHistoryTurn[]): string | null {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const turn = history[i];
    if (turn.role !== "user") continue;
    if (turn.intent && /^create_(expense|income|transfer)$/.test(turn.intent)) {
      return turn.content;
    }
    const parsed = parseIntent(turn.content);
    if (
      parsed.kind === "create_expense" ||
      parsed.kind === "create_income" ||
      parsed.kind === "create_transfer"
    ) {
      return turn.content;
    }
  }
  return null;
}

export function isFollowUpMessage(message: string, history: ChatHistoryTurn[] = []): boolean {
  if (!lastTransactionMessage(history)) return false;
  const direct = parseIntent(message);
  const lower = message.trim().toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  if (REFERENTIAL.test(lower)) return true;
  return direct.kind === "unknown" && findAmount(message) === undefined && words.length <= 3;
}

function stripCorrectionTail(text: string): string {
  return text.replace(/\s*\b(instead of|rather than|not)\b.*$/i, "").trim() || text;
}

function extractDescription(text: string, kind: "expense" | "income"): string {
  const withoutAmount = stripCurrency(text);
  const description = withoutAmount
    .replace(DESCRIPTION_STOPWORDS, "")
    .replace(/[0-9.,]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (description) return description;
  return resolveCategoryFromText(withoutAmount, kind)?.name ?? "";
}

/**
 * Context-aware parse. When the message is a follow-up or correction
 * (e.g. "make it 600", "from Ahmed", "actually income"), its fields are
 * merged onto the most recent transaction in the conversation so the user
 * does not have to repeat everything.
 */
export function parseIntentWithContext(
  message: string,
  history: ChatHistoryTurn[] = [],
): ParsedIntent {
  const direct = parseIntent(message);
  if (!isFollowUpMessage(message, history)) return direct;

  const prevMessage = lastTransactionMessage(history);
  if (!prevMessage) return direct;

  const base = parseIntent(prevMessage);
  if (
    base.kind !== "create_expense" &&
    base.kind !== "create_income" &&
    base.kind !== "create_transfer"
  ) {
    return direct;
  }

  const lower = message.trim().toLowerCase();
  const stripped = stripCorrectionTail(message);
  const curAmount = findAmount(stripped);

  if (base.kind === "create_transfer") {
    return curAmount !== undefined ? { ...base, raw: message, amount: curAmount } : base;
  }

  const kind: "expense" | "income" = hasAnyWord(lower, INCOME_WORDS)
    ? "income"
    : hasAnyWord(lower, EXPENSE_WORDS)
      ? "expense"
      : base.kind === "create_income"
        ? "income"
        : "expense";

  const curCategory = resolveCategoryFromText(stripCurrency(stripped), kind);
  const curDescription = extractDescription(stripped, kind);

  const amount = curAmount !== undefined ? curAmount : base.amount;
  const categoryName = curCategory?.name ?? base.categoryName;
  const description = curDescription || base.description;

  if (kind === "income") {
    return { kind: "create_income", raw: message, amount, categoryName, description, date: base.date };
  }
  return { kind: "create_expense", raw: message, amount, categoryName, description, date: base.date };
}