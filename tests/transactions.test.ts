import { describe, it, expect, afterAll } from "vitest";
import { makeUser, cleanupUsers, prisma } from "./helpers";
import { createTransaction } from "@/lib/services/transactions";

const createdUserIds: string[] = [];
async function user() {
  const u = await makeUser();
  createdUserIds.push(u.id);
  return u;
}

afterAll(async () => {
  await cleanupUsers(createdUserIds);
});

describe("category resolution when creating a transaction", () => {
  it("maps an AI-invented label onto the seeded category instead of duplicating it", async () => {
    const u = await user();

    // "burger" and "lunch" must land in the same category, not two.
    await createTransaction(u.id, {
      type: "expense",
      amount: 2000,
      categoryName: "Food",
      description: "burger",
      date: "2030-02-01",
    });
    await createTransaction(u.id, {
      type: "expense",
      amount: 500,
      categoryName: "Food/Drink",
      description: "lunch",
      date: "2030-02-01",
    });

    const names = (
      await prisma.category.findMany({
        where: { userId: u.id, kind: "expense" },
        select: { name: true },
      })
    ).map((c) => c.name);

    expect(names).toContain("Food/Drink");
    expect(names).not.toContain("Food");

    const txns = await prisma.transaction.findMany({
      where: { userId: u.id, type: "expense" },
      include: { category: true },
    });
    expect(txns).toHaveLength(2);
    expect(txns.every((t) => t.category?.name === "Food/Drink")).toBe(true);
  });

  it("reuses a genuinely new category case-insensitively", async () => {
    const u = await user();

    await createTransaction(u.id, {
      type: "expense",
      amount: 100,
      categoryName: "Crypto Trading",
      description: "eth topup",
      date: "2030-02-02",
    });
    await createTransaction(u.id, {
      type: "expense",
      amount: 100,
      categoryName: "crypto trading",
      description: "eth topup",
      date: "2030-02-03",
    });

    const cats = await prisma.category.findMany({
      where: { userId: u.id, kind: "expense", name: { equals: "crypto trading", mode: "insensitive" } },
    });
    expect(cats).toHaveLength(1);
  });
});
