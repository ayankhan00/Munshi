import { describe, it, expect } from "vitest";
import { parseIntent, parseIntentWithContext, type ChatHistoryTurn } from "@/lib/ai/parser";

describe("income vs expense detection", () => {
  it("treats 'I got X from Y' as income, not expense", () => {
    const intent = parseIntent("I got 20 from abdullah");
    expect(intent.kind).toBe("create_income");
    if (intent.kind === "create_income") {
      expect(intent.amount).toBe(20);
      expect(intent.description).toBe("abdullah");
    }
  });

  it("treats 'got <amount> from <person>' as income", () => {
    const intent = parseIntent("I got 500 from Ali");
    expect(intent.kind).toBe("create_income");
    if (intent.kind === "create_income") {
      expect(intent.amount).toBe(500);
      expect(intent.description).toBe("Ali");
    }
  });

  it("treats 'got salary' as income", () => {
    const intent = parseIntent("got salary 50000");
    expect(intent.kind).toBe("create_income");
    if (intent.kind === "create_income") {
      expect(intent.amount).toBe(50000);
    }
  });

  it("treats 'gave my brother 500' as an expense", () => {
    const intent = parseIntent("gave my brother 500");
    expect(intent.kind).toBe("create_expense");
    if (intent.kind === "create_expense") {
      expect(intent.amount).toBe(500);
      expect(intent.description).toBe("brother");
    }
  });

  it("does not match 'got' inside another word (forgot)", () => {
    const intent = parseIntent("forgot 300 purse");
    expect(intent.kind).toBe("create_expense");
  });
});

describe("conversation context", () => {
  const history: ChatHistoryTurn[] = [
    { role: "user", content: "I got 20 from abdullah", intent: "create_income" },
    { role: "assistant", content: "Done! Recorded income of Rs 20 from abdullah." },
  ];

  it("applies an amount correction to the previous transaction", () => {
    const intent = parseIntentWithContext("make it 600", history);
    expect(intent.kind).toBe("create_income");
    if (intent.kind === "create_income") {
      expect(intent.amount).toBe(600);
      expect(intent.description).toBe("abdullah");
    }
  });

  it("updates the amount from an 'instead of' correction", () => {
    const prev: ChatHistoryTurn[] = [
      { role: "user", content: "I got 800 from abdullah", intent: "create_income" },
    ];
    const intent = parseIntentWithContext("make it 600 instead of 800", prev);
    expect(intent.kind).toBe("create_income");
    if (intent.kind === "create_income") {
      expect(intent.amount).toBe(600);
      expect(intent.description).toBe("abdullah");
    }
  });

  it("updates the description from an 'instead of' correction", () => {
    const prev: ChatHistoryTurn[] = [
      { role: "user", content: "I spent 800 on burger", intent: "create_expense" },
    ];
    const intent = parseIntentWithContext("i spent it on pizza instead of burger", prev);
    expect(intent.kind).toBe("create_expense");
    if (intent.kind === "create_expense") {
      expect(intent.amount).toBe(800);
      expect(intent.description).toBe("pizza");
    }
  });

  it("applies a kind correction (actually income)", () => {
    const spent: ChatHistoryTurn[] = [{ role: "user", content: "I spent 200 on dinner" }];
    const intent = parseIntentWithContext("actually it was income", spent);
    expect(intent.kind).toBe("create_income");
    if (intent.kind === "create_income") {
      expect(intent.amount).toBe(200);
      expect(intent.description).toBe("dinner");
    }
  });

  it("merges a short follow-up fragment", () => {
    const intent = parseIntentWithContext("from ahmed", history);
    expect(intent.kind).toBe("create_income");
    if (intent.kind === "create_income") {
      expect(intent.amount).toBe(20);
      expect(intent.description).toBe("ahmed");
    }
  });

  it("does not hijack a self-contained new transaction", () => {
    const intent = parseIntentWithContext("I spent 700 on petrol", history);
    expect(intent.kind).toBe("create_expense");
    if (intent.kind === "create_expense") {
      expect(intent.amount).toBe(700);
    }
  });

  it("falls back to a normal parse when there is no history", () => {
    expect(parseIntentWithContext("I got 20 from abdullah", []).kind).toBe("create_income");
  });
});
