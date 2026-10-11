export const MINOR_PER_UNIT = 100;

export function toMinor(amount: number | string): number {
  const n =
    typeof amount === "string"
      ? parseFloat(amount.replace(/[,\s\u00a0]/g, ""))
      : amount;
  if (!Number.isFinite(n)) throw new Error("Invalid amount");
  if (n > 1e10) throw new Error("Amount too large");
  return Math.round(n * MINOR_PER_UNIT);
}

export function fromMinor(minor: number): number {
  return minor / MINOR_PER_UNIT;
}

export function formatMoney(
  minor: number,
  currency = "PKR",
  opts: { fractionDigits?: number } = {},
): string {
  const frac = opts.fractionDigits ?? 0;
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency,
    minimumFractionDigits: frac,
    maximumFractionDigits: frac,
  }).format(fromMinor(minor));
}

const ONES: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const SCALES: Record<string, number> = {
  hundred: 100,
  thousand: 1_000,
  lakh: 100_000,
  million: 1_000_000,
  crore: 10_000_000,
  billion: 1_000_000_000,
};

export function parseEnglishNumberWords(text: string): number | null {
  const clean = text
    .toLowerCase()
    .replace(/[,]/g, " ")
    .replace(/\band\b/g, " ")
    .replace(/[-\u2013]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return null;

  const tokens = clean.split(" ");
  let total = 0;
  let current = 0;
  let found = false;

  for (const tok of tokens) {
    if (tok in ONES) {
      current += ONES[tok];
      found = true;
    } else if (tok === "a") {
      current += 1;
      found = true;
    } else if (tok in TENS) {
      current += TENS[tok];
      found = true;
    } else if (tok === "hundred") {
      current = (current || 1) * 100;
      found = true;
    } else if (tok in SCALES) {
      total += (current || 1) * SCALES[tok];
      current = 0;
      found = true;
    } else if (/^\d+$/.test(tok)) {
      current += parseInt(tok, 10);
      found = true;
    } else if (/^(\d+(\.\d+)?)$/.test(tok)) {
      total += parseFloat(tok);
      found = true;
    }
  }
  total += current;
  return found ? total : null;
}

const URDU_DIGITS: Record<string, number> = {
  صفر: 0,
  ایک: 1,
  دو: 2,
  تین: 3,
  چار: 4,
  پانچ: 5,
  چھ: 6,
  سات: 7,
  آٹھ: 8,
  نو: 9,
  دس: 10,
};

export function parseUrduNumberWords(text: string): number | null {
  const tokens = text.trim().split(/\s+/);
  let total = 0;
  let found = false;
  for (const t of tokens) {
    if (t in URDU_DIGITS) {
      total += URDU_DIGITS[t];
      found = true;
    }
    if (/^[۰-۹]+$/.test(t)) {
      const s = t
        .split("")
        .map((c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c))
        .join("");
      total += parseInt(s, 10);
      found = true;
    }
  }
  return found ? total : null;
}

const AMOUNT_TOKEN_RE = /(\d[\d,]*(?:\.\d+)?)|([a-z]+)/gi;

interface AmountToken {
  type: "add" | "hundred" | "scale";
  value: number;
  start: number;
  end: number;
}

export interface AmountInfo {
  value: number | null;
  compound: boolean;
}

function evaluateAmountTokens(tokens: AmountToken[]): number {
  let total = 0;
  let current = 0;
  for (const token of tokens) {
    if (token.type === "add") {
      current += token.value;
    } else if (token.type === "hundred") {
      current = (current || 1) * 100;
    } else {
      total += (current || 1) * token.value;
      current = 0;
    }
  }
  return total + current;
}

// Speech-to-text commonly splits a spoken quantity into separate tokens
// ("five hundred and seventy three" -> "500 73"). Adjacent number tokens that
// are joined only by whitespace or "and" are additive spoken-number parts
// (500 + 73 = 573), not a concatenation. Tokens separated by any other word or
// punctuation start a new amount, so only the first quantity is used.
export function extractAmountInfo(text: string): AmountInfo {
  const tokens: AmountToken[] = [];
  let started = false;
  let lastEnd = 0;

  for (const match of text.matchAll(AMOUNT_TOKEN_RE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;

    let token: AmountToken | null = null;
    if (match[1] !== undefined) {
      const value = parseFloat(match[1].replace(/,/g, ""));
      if (Number.isFinite(value)) token = { type: "add", value, start, end };
    } else {
      const word = (match[2] ?? "").toLowerCase();
      if (word === "hundred") token = { type: "hundred", value: 100, start, end };
      else if (word in SCALES) token = { type: "scale", value: SCALES[word], start, end };
      else if (word in ONES) token = { type: "add", value: ONES[word], start, end };
      else if (word in TENS) token = { type: "add", value: TENS[word], start, end };
    }

    if (!token) {
      if (started && (match[2] ?? "").toLowerCase() !== "and") break;
      continue;
    }

    if (started && !/^\s*(?:and\s*)?$/i.test(text.slice(lastEnd, start))) break;

    started = true;
    lastEnd = end;
    tokens.push(token);
  }

  if (tokens.length === 0) return { value: null, compound: false };
  return { value: evaluateAmountTokens(tokens), compound: tokens.length >= 2 };
}

export function extractAmount(text: string): number | null {
  return extractAmountInfo(text).value;
}