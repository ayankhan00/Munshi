import { describe, it, expect } from "vitest";
import { parseIntent, parseIntents, normalizePeriod } from "@/lib/ai/parser";
import { extractAmount, toMinor } from "@/lib/money";
import { parseNaturalDateTime } from "@/lib/dates";
import { toZonedTime } from "date-fns-tz";

describe("ai parser", () => {
  it("detects expense with amount and category", () => {
    const intent = parseIntent("Add expense 500 for lunch");
    expect(intent.kind).toBe("create_expense");
    if (intent.kind === "create_expense") {
      expect(intent.amount).toBe(500);
      expect(intent.categoryName).toBe("Food/Drink");
    }
  });

  it("classifies '1200 for coffee' as Food/Drink and keeps the item as description", () => {
    const intent = parseIntent("1200 for coffee");
    expect(intent.kind).toBe("create_expense");
    if (intent.kind === "create_expense") {
      expect(intent.amount).toBe(1200);
      expect(intent.categoryName).toBe("Food/Drink");
      expect(intent.description).toBe("coffee");
    }
  });

  it("handles typos via fuzzy matching ('internt' -> Utility Bills) and keeps description", () => {
    const intent = parseIntent("3000 for internt");
    expect(intent.kind).toBe("create_expense");
    if (intent.kind === "create_expense") {
      expect(intent.amount).toBe(3000);
      expect(intent.categoryName).toBe("Utility Bills");
      expect(intent.description).toBe("internt");
    }
  });

  it("stores 'pasta' as description under Food/Drink", () => {
    const intent = parseIntent("1500 for pasta");
    expect(intent.kind).toBe("create_expense");
    if (intent.kind === "create_expense") {
      expect(intent.amount).toBe(1500);
      expect(intent.categoryName).toBe("Food/Drink");
      expect(intent.description).toBe("pasta");
    }
  });

  it("treats 'spent 700' as an expense, not a spending query", () => {
    const intent = parseIntent("I spent 700 on petrol");
    expect(intent.kind).toBe("create_expense");
    if (intent.kind === "create_expense") {
      expect(intent.amount).toBe(700);
    }
  });

  it("detects spending queries", () => {
    expect(parseIntent("How much did I spend this month?").kind).toBe("query_spending");
  });

  it("detects balance queries", () => {
    expect(parseIntent("What is my balance?").kind).toBe("query_balance");
  });

  it("treats paying a credit card balance as an expense, not a balance query", () => {
    const intent = parseIntent("I paid my credit card balance 500");
    expect(intent.kind).toBe("create_expense");
    if (intent.kind === "create_expense") expect(intent.amount).toBe(500);
  });

  it("splits one utterance into separate expense intents", () => {
    const intents = parseIntents("I spent 100 on lunch and 200 on dinner");
    expect(intents.map((i) => i.kind)).toEqual(["create_expense", "create_expense"]);
    expect(intents.map((i) => (i.kind === "create_expense" ? i.amount : undefined))).toEqual([
      100, 200,
    ]);
    expect(
      intents.map((i) => (i.kind === "create_expense" ? i.description : undefined)),
    ).toEqual(["lunch", "dinner"]);
  });

  it("keeps a spoken compound amount joined by 'and' as one expense", () => {
    const intents = parseIntents("I spent 500 and 73 on tea");
    expect(intents).toHaveLength(1);
    if (intents[0].kind === "create_expense") expect(intents[0].amount).toBe(573);
  });

  it("detects income with amount", () => {
    const intent = parseIntent("I received salary of 150000");
    expect(intent.kind).toBe("create_income");
    if (intent.kind === "create_income") {
      expect(intent.amount).toBe(150000);
      expect(intent.categoryName).toBe("Salary");
    }
  });

  it("detects tasks", () => {
    const intent = parseIntent("Add task pay electricity bill by tomorrow");
    expect(intent.kind).toBe("create_task");
    if (intent.kind === "create_task") {
      expect(intent.title).toContain("pay electricity bill");
      expect(intent.due).toBe("tomorrow");
    }
  });

  it("detects reminders and strips time from title", () => {
    const intent = parseIntent("Remind me to buy milk tomorrow morning");
    expect(intent.kind).toBe("create_reminder");
    if (intent.kind === "create_reminder") {
      expect(intent.title).toBe("buy milk");
      expect(intent.remind).toContain("morning");
    }
  });

  it("keeps item words that merely end in 'rs' (burgers, not burge)", () => {
    const intent = parseIntent("1459 burgers");
    expect(intent.kind).toBe("create_expense");
    if (intent.kind === "create_expense") {
      expect(intent.amount).toBe(1459);
      expect(intent.description).toBe("burgers");
      expect(intent.categoryName).toBe("Food/Drink");
    }
  });

  it("still strips a real currency prefix", () => {
    const intent = parseIntent("Rs. 1459 burgers");
    expect(intent.kind).toBe("create_expense");
    if (intent.kind === "create_expense") {
      expect(intent.amount).toBe(1459);
      expect(intent.description).toBe("burgers");
    }
  });

  it("returns unknown for gibberish", () => {
    expect(parseIntent("zxcvbn asdf qwerty").kind).toBe("unknown");
  });
});

describe("period and list queries", () => {
  it("normalizes period phrases", () => {
    expect(normalizePeriod("last month")).toBe("last_month");
    expect(normalizePeriod("last week")).toBe("last_week");
    expect(normalizePeriod("last 3 days")).toBe("last_3_days");
    expect(normalizePeriod("last 30 days")).toBe("last_30_days");
    expect(normalizePeriod("yesterday")).toBeUndefined();
  });

  it.each([
    ["How much did I spend last month?", "last_month"],
    ["How much did I spend last week?", "last_week"],
    ["How much did I spend in the last 3 days?", "last_3_days"],
    ["How much did I spend in the past 30 days?", "last_30_days"],
    ["Show me last month's expenses", "last_month"],
  ])("attaches a period to '%s'", (message, period) => {
    expect(parseIntent(message)).toMatchObject({ kind: "query_spending", period });
  });

  it("treats a count in a period phrase as part of the period, not an amount", () => {
    expect(parseIntent("How much did I spend last 3 days?")).toMatchObject({
      kind: "query_spending",
      period: "last_3_days",
    });
  });

  it("parses a recent expense list without creating a transaction", () => {
    expect(parseIntent("Show me my last 5 expenses")).toMatchObject({
      kind: "query_list",
      itemType: "expense",
      limit: 5,
    });
  });

  it("parses a recent income list with a custom count", () => {
    expect(parseIntent("show my last 10 income")).toMatchObject({
      kind: "query_list",
      itemType: "income",
      limit: 10,
    });
  });

  it("defaults to five mixed transactions", () => {
    expect(parseIntent("list my recent transactions")).toMatchObject({
      kind: "query_list",
      itemType: "all",
      limit: 5,
    });
  });
});

describe("extractAmount", () => {
  it("parses plain numbers", () => {
    expect(extractAmount("500")).toBe(500);
  });

  it("parses currency-prefixed numbers", () => {
    expect(extractAmount("Rs. 1,500")).toBe(1500);
  });

  it("parses english number words", () => {
    expect(extractAmount("two thousand rupees")).toBe(2000);
  });

  it("reconstructs a spoken compound number split by STT ('500 73' -> 573)", () => {
    expect(extractAmount("I took a taxi for 500 73")).toBe(573);
  });

  it("reconstructs a compound number joined with 'and'", () => {
    expect(extractAmount("I took a taxi for 500 and 73")).toBe(573);
  });

  it("parses a full english number-word phrase", () => {
    expect(extractAmount("five hundred and seventy three")).toBe(573);
  });

  it("does not merge colon-separated times into one amount", () => {
    expect(extractAmount("I took a taxi for 11:21")).toBe(11);
  });

  it("sums spoken scale compounds (two thousand five hundred -> 2500)", () => {
    expect(extractAmount("two thousand five hundred")).toBe(2500);
  });
});

describe("money", () => {
  it("converts major to minor units", () => {
    expect(toMinor(500)).toBe(50000);
  });
});

describe("parseNaturalDateTime", () => {
  it("maps time words like morning/evening to real times", () => {
    const tz = "Asia/Karachi";
    const morning = parseNaturalDateTime("tomorrow morning", tz);
    expect(morning).not.toBeNull();
    expect(toZonedTime(morning!.date, tz).getHours()).toBe(9);
    expect(morning!.hadDate).toBe(true);

    const night = parseNaturalDateTime("tonight 9pm", tz);
    expect(night).not.toBeNull();
    expect(toZonedTime(night!.date, tz).getHours()).toBe(21);
  });
});