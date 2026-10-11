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

export async function extractWithGemini(query: string): Promise<GeminiExtraction | null> {
  const apiKey = env().geminiApiKey;
  if (!apiKey) return null;

  const model = env().geminiModel;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const systemPrompt = `You are Munshi, a personal finance assistant intent extractor.
Extract structured data from the user's message. Respond with ONLY valid JSON matching one of these shapes:

For expense: {"kind":"create_expense","amount":500,"categoryName":"Food","description":"lunch","date":"today"}
For income: {"kind":"create_income","amount":150000,"categoryName":"Salary","description":"salary","date":"today"}
For transfer: {"kind":"create_transfer","amount":1000,"fromAccount":"Cash","toAccount":"Bank"}
For balance: {"kind":"query_balance"}
For spending: {"kind":"query_spending"}
For income query: {"kind":"query_income"}
For task: {"kind":"create_task","title":"pay bill","due":"tomorrow","priority":"high"}
For reminder: {"kind":"create_reminder","title":"call mom","remind":"6pm"}
For help: {"kind":"help"}
Anything else: {"kind":"unknown"}

amount is a number in major units. Date/due/remind use plain English like "today", "tomorrow", "6pm", "next monday".`;

  const payload = {
    contents: [
      {
        parts: [
          { text: systemPrompt },
          { text: `User message: ${query}` },
        ],
      },
    ],
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