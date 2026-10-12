import { env } from "@/lib/env";

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: { text?: string }[];
    };
  }[];
}

export interface GeminiExtraction {
  kind: string;
  amount?: number;
  categoryName?: string;
  description?: string;
  date?: string;
  title?: string;
  due?: string;
  remind?: string;
  priority?: string;
  fromAccount?: string;
  toAccount?: string;
  period?: string;
}

export interface GeminiTurn {
  role: "user" | "model";
  text: string;
}

interface CategoryOption {
  name: string;
  kind: string;
}

function buildSystemPrompt(currency: string, categories?: CategoryOption[]): string {
  const expenseCategories = (categories ?? [])
    .filter((c) => c.kind === "expense")
    .map((c) => c.name);
  const incomeCategories = (categories ?? [])
    .filter((c) => c.kind === "income")
    .map((c) => c.name);

  const categoryList =
    expenseCategories.length > 0 || incomeCategories.length > 0
      ? `\nThe user's existing categories are:
- Expense: ${expenseCategories.join(", ") || "(none)"}
- Income: ${incomeCategories.join(", ") || "(none)"}
`
      : `\nTypical categories:
- Expense: Food/Drink, Groceries, Transport, Car/Bike, Fuel, Utility Bills, Rent, House, Maid Salary, Health, Education, Shopping, Clothes, Entertainment, Subscription, Gym, Personal Care, Family/Kids, Vacation, Pets, Insurance, Loan, Donation, Gift, Others
- Income: Salary, Freelance, Business, Gift, Interest, Other Income
`;

  return `You are Munshi, a personal finance assistant intent extractor.
Read the conversation so far and the latest user message, then output the user's
intent as ONLY valid JSON (no markdown, no prose).

Rules:
- Money the user RECEIVES is income: got, received, earned, credited, deposit,
  salary, "mila", "aya", "rekha", آمد. Example: "I got 20 from Abdullah" =>
  {"kind":"create_income","amount":20,"description":"Abdullah"}.
- Money the user SPENDS or PAYS OUT is expense: spent, paid, bought, purchased,
  lent/gave to someone, kharcha, خرچ. Example: "gave my brother 500" =>
  {"kind":"create_expense","amount":500,"description":"brother"}.
- The user's currency is ${currency}. amount is a number in major units.
- categoryName MUST be copied VERBATIM from the user's existing categories in
  the list below. Never invent, translate, shorten or pluralise a category name,
  and never combine two names. Pick the single best-fitting existing category.
  If none fits, omit categoryName entirely.
${categoryList}
- Use the conversation to resolve follow-ups and corrections. If the latest
  message only changes part of the previous transaction (e.g. "make it 600",
  "from Ahmed instead", "actually that was income"), return the FULL corrected
  intent (all fields, not just the change).

JSON shapes:
For expense: {"kind":"create_expense","amount":500,"categoryName":"Food/Drink","description":"lunch","date":"today"}
For income: {"kind":"create_income","amount":150000,"categoryName":"Salary","description":"salary","date":"today"}
For transfer: {"kind":"create_transfer","amount":1000,"fromAccount":"Cash","toAccount":"Bank"}
For balance: {"kind":"query_balance"}
For spending: {"kind":"query_spending"}
For income query: {"kind":"query_income"}
For task: {"kind":"create_task","title":"pay bill","due":"tomorrow","priority":"high"}
For reminder: {"kind":"create_reminder","title":"call mom","remind":"6pm"}
For help: {"kind":"help"}
Anything else: {"kind":"unknown"}

Date/due/remind use plain English like "today", "tomorrow", "6pm", "next monday".`;
}

export async function extractWithGemini(
  query: string,
  history: GeminiTurn[] = [],
  opts: { currency?: string; categories?: CategoryOption[] } = {},
): Promise<GeminiExtraction | null> {
  const apiKey = env().geminiApiKey;
  if (!apiKey) return null;

  const model = env().geminiModel;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const cleanHistory = history
    .filter((t) => t.text && t.text.trim().length > 0)
    .slice(-4);
  const firstUser = cleanHistory.findIndex((t) => t.role === "user");
  const turns = firstUser === -1 ? [] : cleanHistory.slice(firstUser);

  const contents = [
    ...turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    { role: "user", parts: [{ text: query }] },
  ];

  const payload = {
    systemInstruction: { parts: [{ text: buildSystemPrompt(opts.currency ?? "PKR", opts.categories) }] },
    contents,
    generationConfig: { temperature: 0.1, maxOutputTokens: 300 },
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
    return JSON.parse(match[0]) as GeminiExtraction;
  } catch {
    return null;
  }
}
