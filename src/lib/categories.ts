export interface CategorySeed {
  name: string;
  kind: "expense" | "income";
  color: string;
  icon?: string;
}

export const DEFAULT_EXPENSE_CATEGORIES: CategorySeed[] = [
  { name: "Food/Drink", kind: "expense", color: "#f59e0b", icon: "utensils" },
  { name: "Groceries", kind: "expense", color: "#84cc16", icon: "shopping-cart" },
  { name: "Transport", kind: "expense", color: "#38bdf8", icon: "car-taxi-front" },
  { name: "Car/Bike", kind: "expense", color: "#0ea5e9", icon: "car" },
  { name: "Fuel", kind: "expense", color: "#0284c7", icon: "fuel" },
  { name: "Utility Bills", kind: "expense", color: "#6366f1", icon: "receipt" },
  { name: "Rent", kind: "expense", color: "#fb7185", icon: "home" },
  { name: "House", kind: "expense", color: "#14b8a6", icon: "house" },
  { name: "Maid Salary", kind: "expense", color: "#f97316", icon: "users" },
  { name: "Health", kind: "expense", color: "#f87171", icon: "heart-pulse" },
  { name: "Education", kind: "expense", color: "#34d399", icon: "book-open" },
  { name: "Shopping", kind: "expense", color: "#ec4899", icon: "shopping-bag" },
  { name: "Clothes", kind: "expense", color: "#f472b6", icon: "shirt" },
  { name: "Entertainment", kind: "expense", color: "#d946ef", icon: "clapperboard" },
  { name: "Subscription", kind: "expense", color: "#a855f7", icon: "repeat" },
  { name: "Gym", kind: "expense", color: "#22c55e", icon: "dumbbell" },
  { name: "Personal Care", kind: "expense", color: "#e879f9", icon: "scissors" },
  { name: "Family/Kids", kind: "expense", color: "#fb923c", icon: "baby" },
  { name: "Vacation", kind: "expense", color: "#06b6d4", icon: "plane" },
  { name: "Pets", kind: "expense", color: "#d97706", icon: "paw-print" },
  { name: "Insurance", kind: "expense", color: "#64748b", icon: "shield" },
  { name: "Loan", kind: "expense", color: "#ef4444", icon: "landmark" },
  { name: "Donation", kind: "expense", color: "#10b981", icon: "hand-heart" },
  { name: "Gift", kind: "expense", color: "#f472b6", icon: "gift" },
  { name: "Others", kind: "expense", color: "#64748b", icon: "circle" },
];

export const DEFAULT_INCOME_CATEGORIES: CategorySeed[] = [
  { name: "Salary", kind: "income", color: "#22c55e", icon: "banknote" },
  { name: "Freelance", kind: "income", color: "#10b981", icon: "laptop" },
  { name: "Business", kind: "income", color: "#059669", icon: "briefcase" },
  { name: "Gift", kind: "income", color: "#f472b6", icon: "gift" },
  { name: "Interest", kind: "income", color: "#0d9488", icon: "piggy-bank" },
  { name: "Other Income", kind: "income", color: "#16a34a", icon: "plus-circle" },
];

export const DEFAULT_CATEGORIES: CategorySeed[] = [
  ...DEFAULT_EXPENSE_CATEGORIES,
  ...DEFAULT_INCOME_CATEGORIES,
];

// Keyword / synonym dictionary used by the AI assistant to route free-text
// descriptions to the right category. Keys are canonical category names.
const EXPENSE_KEYWORDS: Record<string, string[]> = {
  "Food/Drink": [
    "food", "drink", "drinks", "beverage", "coffee", "tea", "chai", "cafe", "restaurant",
    "lunch", "dinner", "breakfast", "brunch", "snack", "snacks", "meal", "eating", "eat",
    "pizza", "burger", "pasta", "biryani", "noodles", "sandwich", "shawarma", "paratha",
    "roti", "nihari", "karahi", "bbq", "juice", "soda", "coke", "pepsi", "dessert",
    "ice cream", "cake", "chocolate", "khana", "nashta", "mcdonald", "kfc",
  ],
  Groceries: [
    "grocery", "groceries", "kiryana", "sabzi", "supermarket", "mart", "vegetables",
    "fruit", "fruits", "atta", "flour", "rice", "milk", "eggs", "bread", "ration",
    "daal", "dal", "masala", "cooking oil", "spices", "dry fruit",
  ],
  Transport: [
    "taxi", "uber", "careem", "indrive", "rickshaw", "rikshaw", "auto", "bus", "metro",
    "train", "fare", "ride", "cab", "transport", "commute", "daewoo", "van",
  ],
  "Car/Bike": [
    "car", "bike", "motorbike", "motorcycle", "scooter", "vehicle", "tyre", "tire",
    "mechanic", "car service", "bike service", "car wash", "oil change", "engine",
    "battery", "car repair", "bike repair", "challan", "speedometer", "registration",
  ],
  Fuel: [
    "fuel", "petrol", "diesel", "cng", "gas", "gasoline", "refuel", "petrol pump",
    "filling station",
  ],
  "Utility Bills": [
    "utility", "utilities", "utility bill", "utility bills",
    "electricity", "electric", "bijli", "wapda", "k electric", "kelectric", "iesco",
    "lesco", "gesco", "mepco", "gas bill", "sui gas", "suigas", "ssgc", "sngpl",
    "water bill", "water", "phone bill", "mobile bill", "mobile", "phone", "recharge",
    "internet", "internt", "wifi", "wi fi", "broadband", "fiber", "fibre", "ptcl",
    "net", "internet bill", "data package", "hotspot",
  ],
  Rent: ["rent", "kiraya", "lease", "landlord", "rental"],
  House: [
    "house", "home", "furniture", "repair", "repairs", "maintenance", "plumbing",
    "electrician", "carpenter", "paint", "painting", "sofa", "bed", "curtain",
    "kitchen", "utensils", "crockery", "gas cylinder", "renovation", "hardware",
    "cleaning", "cleaning supplies",
  ],
  "Maid Salary": [
    "maid", "maids", "servant", "bai", "cook", "housekeeper", "aya", "nanny", "masi",
    "maid salary", "maasi",
  ],
  Health: [
    "health", "health care", "healthcare", "medical", "medicine", "medicines", "doctor",
    "hospital", "clinic", "pharmacy", "dawa", "dawai", "checkup", "check up", "lab",
    "lab test", "dentist", "dental", "surgery", "treatment", "pharma", "vaccine",
    "operation", "blood test",
  ],
  Education: [
    "education", "school", "college", "university", "tuition", "tutor", "fee", "fees",
    "admission", "course", "courses", "books", "book", "stationery", "exam", "coaching",
    "madrassa", "academy", "semester",
  ],
  Shopping: [
    "shopping", "shop", "mall", "market", "bazaar", "amazon", "daraz", "aliexpress",
    "store", "outlet", "purchase",
  ],
  Clothes: [
    "clothes", "cloth", "clothing", "dress", "shirt", "t shirt", "tshirt", "shalwar",
    "kameez", "kurta", "pant", "pants", "jeans", "trouser", "trousers", "shoes",
    "sandal", "jacket", "sweater", "suit", "abaya", "dupatta", "scarf", "socks",
    "uniform", "tailor", "fabric",
  ],
  Entertainment: [
    "entertainment", "movie", "movies", "cinema", "film", "game", "games", "gaming",
    "concert", "party", "event", "amusement", "outing", "picnic", "fair",
  ],
  Subscription: [
    "subscription", "subscriptions", "netflix", "spotify", "youtube premium", "prime",
    "icloud", "membership", "monthly plan", "disney", "hulu", "patreon", "app plan",
  ],
  Gym: [
    "gym", "fitness", "workout", "yoga", "trainer", "crossfit", "aerobics", "zumba",
    "weights", "dumbbell", "treadmill", "pilates", "gym fee",
  ],
  "Personal Care": [
    "beauty", "haircut", "hair cut", "salon", "parlour", "parlor", "barber", "spa",
    "facial", "makeup", "cosmetics", "groom", "pedicure", "manicure", "threading",
    "waxing", "nails", "shave", "hair", "personal care", "skin care", "skincare",
    "grooming", "hygiene",
  ],
  "Family/Kids": [
    "family", "kids", "kid", "children", "child", "baby", "babies", "daycare",
    "day care", "toys", "toy", "baby products", "diapers", "kindergarten",
  ],
  Vacation: [
    "vacation", "holiday", "holidays", "trip", "travel", "tour", "umrah", "hajj",
    "pilgrimage", "hotel", "flight", "flights", "airline", "airfare", "resort",
    "tourism", "visa", "honeymoon", "tourist",
  ],
  Pets: [
    "pet", "pets", "cat", "dog", "vet", "veterinary", "bird", "fish", "animal",
    "kitten", "puppy", "pet food",
  ],
  Insurance: [
    "insurance", "insure", "policy", "premium", "takaful", "mediclaim", "life insurance",
  ],
  Loan: [
    "loan", "loans", "emi", "installment", "instalment", "qist", "qistain", "debt",
    "mortgage", "qarz", "karza", "credit card payment", "installment",
  ],
  Donation: [
    "donation", "donate", "charity", "zakat", "sadaqah", "sadqa", "fitra", "khairat",
    "welfare", "sadqa",
  ],
  Gift: ["gift", "gifts", "present", "hadiya", "eidi"],
  Others: [
    "others", "other", "misc", "miscellaneous", "sundry", "unspecified", "general",
  ],
};

const INCOME_KEYWORDS: Record<string, string[]> = {
  Salary: [
    "salary", "salaries", "payroll", "wage", "wages", "tankah", "tanakh", "tanak",
    "salary aya", "paycheck",
  ],
  Freelance: [
    "freelance", "freelancing", "client", "project payment", "gig", "upwork", "fiverr",
    "consulting", "commission", "side income",
  ],
  Business: [
    "business", "sales", "revenue", "profit", "dukaan", "trade", "merchant", "shop income",
  ],
  Gift: ["gift received", "eidi", "hadiya", "gift income", "gift"],
  Interest: [
    "interest", "profit sharing", "dividend", "mudarabah", "markup", "yield",
    "bank profit",
  ],
  "Other Income": [
    "other income", "others income", "refund received", "cashback", "rebate",
    "misc income", "other", "others", "misc", "miscellaneous", "general",
  ],
};

interface KeywordEntry {
  word: string;
  category: string;
  re: RegExp;
  multi: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildKeywords(map: Record<string, string[]>): KeywordEntry[] {
  const entries: KeywordEntry[] = [];
  for (const [category, words] of Object.entries(map)) {
    for (const raw of words) {
      const word = raw.toLowerCase().trim();
      if (!word) continue;
      entries.push({
        word,
        category,
        re: new RegExp(`\\b${escapeRegExp(word)}\\b`),
        multi: word.includes(" "),
      });
    }
  }
  return entries.sort((a, b) => b.word.length - a.word.length);
}

const EXPENSE_ENTRIES = buildKeywords(EXPENSE_KEYWORDS);
const INCOME_ENTRIES = buildKeywords(INCOME_KEYWORDS);

export function normalizeForMatching(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchByKeyword(norm: string, entries: KeywordEntry[]): string | null {
  for (const entry of entries) {
    if (entry.re.test(norm)) return entry.category;
  }
  return null;
}

// Optimal string alignment (Damerau-Levenshtein with adjacent transpositions).
function editDistance(a: string, b: string): number {
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const d: number[][] = Array.from({ length: al + 1 }, () => new Array<number>(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) d[i][0] = i;
  for (let j = 0; j <= bl; j++) d[0][j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[al][bl];
}

function maxTypoDistance(tokenLength: number): number {
  if (tokenLength <= 4) return 0;
  if (tokenLength <= 7) return 1;
  return 2;
}

// Fuzzy fallback for fat-fingered words: "internt" -> "internet", "cofee" -> "coffee".
function matchFuzzy(norm: string, entries: KeywordEntry[]): string | null {
  const tokens = norm.split(" ").filter((t) => t.length >= 4);
  if (tokens.length === 0) return null;
  const singles = entries.filter((e) => !e.multi);
  let best: { category: string; distance: number } | null = null;
  for (const token of tokens) {
    const limit = maxTypoDistance(token.length);
    if (limit === 0) continue;
    for (const entry of singles) {
      if (Math.abs(entry.word.length - token.length) > limit) continue;
      const distance = editDistance(token.toLowerCase(), entry.word);
      if (distance <= limit) {
        if (!best || distance < best.distance || (distance === best.distance && entry.word.length > 0)) {
          best = { category: entry.category, distance };
        }
      }
    }
  }
  return best?.category ?? null;
}

function findCategorySeed(name: string, kind?: "expense" | "income"): CategorySeed | null {
  if (kind) {
    return DEFAULT_CATEGORIES.find((c) => c.name === name && c.kind === kind) ?? null;
  }
  return (
    DEFAULT_CATEGORIES.find((c) => c.name === name && c.kind === "expense") ??
    DEFAULT_CATEGORIES.find((c) => c.name === name) ??
    null
  );
}

/**
 * Resolve a free-text description to a category. Pass `kind` to search only
 * expense or income categories; omit it to search both (expense first).
 */
export function resolveCategoryFromText(
  text: string,
  kind?: "expense" | "income",
): CategorySeed | null {
  const norm = normalizeForMatching(text);
  if (!norm) return null;

  const searchSets = kind === "income"
    ? [INCOME_ENTRIES]
    : kind === "expense"
      ? [EXPENSE_ENTRIES]
      : [EXPENSE_ENTRIES, INCOME_ENTRIES];

  for (const entries of searchSets) {
    const byKeyword = matchByKeyword(norm, entries);
    if (byKeyword) return findCategorySeed(byKeyword, kind);
  }
  for (const entries of searchSets) {
    const byFuzzy = matchFuzzy(norm, entries);
    if (byFuzzy) return findCategorySeed(byFuzzy, kind);
  }
  return null;
}
