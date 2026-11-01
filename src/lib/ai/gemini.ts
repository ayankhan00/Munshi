import { env } from "@/lib/env";

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: { text?: string }[];
    };
  }[];
}

export interface GeminiAction {
  type: string;
  amount?: number;
  categoryName?: string;
  description?: string;
  date?: string;
  fromAccount?: string;
  toAccount?: string;
  title?: string;
  due?: string;
  remind?: string;
  priority?: string;
  period?: string;
  targetTransactionId?: string;
  changes?: {
    amount?: number;
    categoryName?: string;
    description?: string;
    date?: string;
  };
}

export interface GeminiPlan {
  transcript?: string;
  actions: GeminiAction[];
}

interface CategoryOption {
  name: string;
  kind: string;
}

export interface RecentTransaction {
  id: string;
  amount: number;
  type: string;
  category: string;
  description: string;
  date: string;
}

interface PlanOptions {
  currency?: string;
  categories?: CategoryOption[];
  recentTransactions?: RecentTransaction[];
}

function buildSystemPrompt(
  currency: string,
  categories: CategoryOption[] = [],
  recent: RecentTransaction[] = [],
): string {
  const expenseCategories = categories
    .filter((c) => c.kind === "expense")
    .map((c) => c.name);
  const incomeCategories = categories
    .filter((c) => c.kind === "income")
    .map((c) => c.name);

  const categoryList =
    expenseCategories.length > 0 || incomeCategories.length > 0
      ? `The user's existing categories are:
- Expense: ${expenseCategories.join(", ") || "(none)"}
- Income: ${incomeCategories.join(", ") || "(none)"}`
      : `Typical categories:
- Expense: Food/Drink, Groceries, Transport, Car/Bike, Fuel, Utility Bills, Rent, House, Maid Salary, Health, Education, Shopping, Clothes, Entertainment, Subscription, Gym, Personal Care, Family/Kids, Vacation, Pets, Insurance, Loan, Donation, Gift, Others
- Income: Salary, Freelance, Business, Gift, Interest, Other Income`;

  const recentList = recent.length
    ? `The user's ${recent.length} most recent transactions (newest first) as JSON:
${JSON.stringify(recent)}`
    : "The user has no recent transactions.";

  return `You are Munshi, a personal finance assistant. Read the user's message (or the attached audio) and return ONLY valid JSON with this shape:
{"transcript":"<exact words the user said>","actions":[<one or more actions>]}

Rules:
- The user may ask for MULTIPLE things at once, e.g. "I spent 2700 on fuel and 1200 on burger".
  Return one action per distinct item (two create_expense actions in that example). Never merge them.
- A plain statement of new spending or income is ALWAYS a create_expense/create_income, even if a
  similar transaction already exists in the recent list. Do NOT return an update for it.
- Only use update_transaction when the user explicitly asks to change/correct an earlier entry
  (words like "instead", "actually", "change", "correct", "make it", "fix", "not ...").
- Never return both a create action and an update action for the same item, and never repeat an
  action. Each distinct item appears exactly once.
- Money the user RECEIVES is income: got, received, earned, credited, deposit, salary, mila, aya, آمد.
- Money the user SPENDS or PAYS OUT is expense: spent, paid, bought, purchased, kharcha, خرچ.
- amount is a number in major units (NOT paisa). If the user repeats the same number while speaking,
  treat it as one amount, not a sum.
- categoryName MUST be copied VERBATIM from the user's existing categories below. Never invent,
  translate or pluralise a category name. If none fits, omit categoryName.
- date/due/remind use plain English like "today", "tomorrow", "6pm", "next monday".
- To modify an earlier transaction ("instead of 1200", "make it 1500", "change the last one",
  "not burger, it was petrol"), return ONE action:
  {"type":"update_transaction","targetTransactionId":"<id from the recent list>","changes":{"amount":1500}}
  Use only ids from the recent list. NEVER invent a targetTransactionId.
- "transcript" must be the exact words the user said (for audio) or the message (for text).
- Output no markdown and no prose.

${categoryList}

${recentList}

Action shapes:
- Expense: {"type":"create_expense","amount":500,"categoryName":"Food/Drink","description":"lunch","date":"today"}
- Income: {"type":"create_income","amount":150000,"categoryName":"Salary","description":"salary","date":"today"}
- Transfer: {"type":"create_transfer","amount":1000,"fromAccount":"Cash","toAccount":"Bank"}
- Balance: {"type":"query_balance"}
- Spending: {"type":"query_spending"}
- Income query: {"type":"query_income"}
- Task: {"type":"create_task","title":"pay bill","due":"tomorrow","priority":"high"}
- Reminder: {"type":"create_reminder","title":"call mom","remind":"6pm"}
- Update: {"type":"update_transaction","targetTransactionId":"...","changes":{"amount":1500,"description":"burgers"}}
- Help: {"type":"help"}
If nothing applies: {"transcript":"...","actions":[{"type":"unknown"}]}`;
}

export async function planWithGemini(
  input: { text?: string; audio?: { mimeType: string; data: string } },
  opts: PlanOptions = {},
): Promise<GeminiPlan | null> {
  const apiKey = env().geminiApiKey;
  if (!apiKey) return null;

  const model = env().geminiModel;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const parts: unknown[] = [];
  if (input.audio) {
    parts.push({ text: "Transcribe this audio and extract the user's finance actions." });
    parts.push({ inlineData: input.audio });
  } else {
    parts.push({ text: input.text ?? "" });
  }

  const payload = {
    systemInstruction: {
      parts: [
        {
          text: buildSystemPrompt(
            opts.currency ?? "PKR",
            opts.categories,
            opts.recentTransactions,
          ),
        },
      ],
    },
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 800 },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as GeminiPlan;
    if (!Array.isArray(parsed.actions)) return null;
    return parsed;
  } catch {
    return null;
  }
}
