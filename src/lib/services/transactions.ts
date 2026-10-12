import { prisma } from "@/lib/db";
import { toMinor } from "@/lib/money";
import { zonedAt, periodKey } from "@/lib/dates";
import { DEFAULT_CATEGORIES, resolveCategoryFromText } from "@/lib/categories";
import { logAudit } from "@/lib/audit";
import { balanceForAccount } from "@/lib/ledger";
import type { txCreateSchema } from "@/lib/validation";
import type { z } from "zod";

export type TxInput = z.input<typeof txCreateSchema>;

export const EXPENSE_TYPES = ["expense", "income", "transfer", "refund", "adjustment"] as const;

export async function installDefaultCategories(userId: string): Promise<void> {
  const allowed = new Set(DEFAULT_CATEGORIES.map((c) => `${c.kind}:${c.name}`));
  const existing = await prisma.category.findMany({
    where: { userId },
    select: { id: true, name: true, kind: true, isSystem: true, archived: true },
  });
  const have = new Set(existing.map((c) => `${c.kind}:${c.name}`));
  const missing = DEFAULT_CATEGORIES.filter((c) => !have.has(`${c.kind}:${c.name}`));
  if (missing.length > 0) {
    await prisma.category.createMany({
      data: missing.map((c) => ({
        userId,
        name: c.name,
        kind: c.kind,
        color: c.color,
        icon: c.icon,
        isSystem: true,
      })),
    });
  }
  // Retire built-in categories that are no longer part of the default set.
  const staleIds = existing
    .filter((c) => c.isSystem && !c.archived && !allowed.has(`${c.kind}:${c.name}`))
    .map((c) => c.id);
  if (staleIds.length > 0) {
    await prisma.category.updateMany({
      where: { id: { in: staleIds } },
      data: { archived: true },
    });
  }
}

export async function getDefaultAccount(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { userId, archived: false },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  if (account) return account.id;
  const created = await prisma.account.create({
    data: { userId, name: "Cash", type: "cash", isDefault: true },
  });
  return created.id;
}

async function resolveCategory(
  userId: string,
  kind: "income" | "expense",
  categoryId?: string,
  categoryName?: string,
  description?: string,
): Promise<string | null> {
  if (categoryId) {
    const cat = await prisma.category.findFirst({
      where: { id: categoryId, userId, kind },
    });
    if (cat && !cat.archived) return cat.id;
    return null;
  }

  const explicit = categoryName?.trim() ?? "";
  const existing = await prisma.category.findMany({
    where: { userId, kind },
    select: { id: true, name: true, archived: true },
  });
  const active = existing.filter((c) => !c.archived);
  const findByName = (name: string) =>
    active.find((c) => c.name.toLowerCase() === name.toLowerCase());

  if (explicit) {
    // 1. Exact (case-insensitive) match of an existing category.
    const direct = findByName(explicit);
    if (direct) return direct.id;

    // 2. Canonicalise a free-form label onto a known category so the AI can
    //    never fork a near-duplicate ("Food" -> "Food/Drink", "Health" ->
    //    "Health Care", "Transport" -> "Taxi"). Description is used as a
    //    tie-breaker when the label alone is ambiguous.
    const canonical =
      resolveCategoryFromText(explicit, kind)?.name ??
      (description
        ? resolveCategoryFromText(`${explicit} ${description}`, kind)?.name
        : null);
    if (canonical) {
      const match = findByName(canonical);
      if (match) return match.id;
    }

    // 3. Genuinely new category: create it once, using the canonical seed.
    const name = canonical ?? explicit;
    const seed = DEFAULT_CATEGORIES.find((c) => c.name === name && c.kind === kind) ?? {
      name,
      kind,
      color: kind === "income" ? "#22c55e" : "#64748b",
    };
    const created = await prisma.category.create({
      data: {
        userId,
        name,
        kind,
        color: seed.color,
        icon: seed.icon,
        isSystem: false,
      },
    });
    return created.id;
  }

  if (description) {
    const canonical = resolveCategoryFromText(description, kind)?.name;
    if (canonical) {
      const match = findByName(canonical);
      if (match) return match.id;
    }
  }
  return null;
}

export async function createTransaction(userId: string, input: TxInput) {
  if (input.idempotencyKey) {
    const existing = await prisma.transaction.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: input.idempotencyKey } },
    });
    if (existing) {
      return {
        transaction: existing,
        duplicate: true,
        balance: await getCurrentBalance(userId),
      };
    }
  }

  const accountId = input.accountId ?? (await getDefaultAccount(userId));
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId, archived: false },
  });
  if (!account) throw new Error("Account not found");

  const amountMinor = toMinor(input.amount);

  if (input.type === "transfer") {
    const target = await prisma.account.findFirst({
      where: { id: input.transferAccountId, userId, archived: false },
    });
    if (!target) throw new Error("Destination account not found");
    if (target.id === account.id) throw new Error("Cannot transfer to the same account");
  }

  let categoryId: string | null = null;
  if (input.type === "income" || input.type === "expense") {
    categoryId = await resolveCategory(
      userId,
      input.type,
      input.categoryId,
      input.categoryName,
      input.description,
    );
  }

  if (input.type === "refund") {
    const src = await prisma.transaction.findFirst({
      where: { id: input.sourceTransactionId, userId, deletedAt: null },
    });
    if (!src || src.type !== "expense") throw new Error("Source expense not found");
    if (amountMinor > src.amountMinor) {
      throw new Error("Refund cannot exceed the original expense amount");
    }
  }

  if (input.type === "adjustment" && !input.reason) {
    throw new Error("Reason is required for manual adjustments");
  }

  const dateStr = input.date;
  const occurredAt = dateStr
    ? (() => {
        const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) throw new Error("Invalid date format");
        const [, y, mo, d] = m;
        return zonedAt("UTC", +y, +mo - 1, +d);
      })()
    : new Date(input.occurredAt ?? Date.now());

  await installDefaultCategories(userId);

  const created = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        userId,
        accountId,
        categoryId,
        transferAccountId: input.type === "transfer" ? input.transferAccountId : undefined,
        sourceTransactionId: input.type === "refund" ? input.sourceTransactionId : undefined,
        type: input.type,
        amountMinor,
        currency: account.currency ?? "PKR",
        occurredAt,
        description: input.description?.trim() || undefined,
        notes: input.notes?.trim() || undefined,
        paymentMethod: input.paymentMethod?.trim() || undefined,
        idempotencyKey: input.idempotencyKey,
        recurringRuleId: input.recurringRuleId,
        adjustmentReason: input.type === "adjustment" ? input.reason : undefined,
      },
    });
    return transaction;
  });

  await logAudit({
    userId,
    action: "create",
    entityType: "transaction",
    entityId: created.id,
    after: {
      type: created.type,
      amountMinor: created.amountMinor,
      accountId: created.accountId,
      categoryId: created.categoryId,
      occurredAt: created.occurredAt.toISOString(),
    },
    reason: input.reason,
  });

  return {
    transaction: created,
    duplicate: false,
    balance: await getCurrentBalance(userId),
  };
}

export async function updateTransaction(
  userId: string,
  id: string,
  patch: Partial<TxInput>,
) {
  const existing = await prisma.transaction.findFirst({
    where: { id, userId, deletedAt: null },
  });
  if (!existing) throw new Error("Transaction not found");

  const before = {
    type: existing.type,
    amountMinor: existing.amountMinor,
    categoryId: existing.categoryId,
    occurredAt: existing.occurredAt.toISOString(),
  };

  const accountId = patch.accountId ?? existing.accountId;
  if (patch.accountId) {
    const account = await prisma.account.findFirst({
      where: { id: accountId, userId, archived: false },
    });
    if (!account) throw new Error("Account not found");
  }
  if (patch.transferAccountId || existing.type === "transfer") {
const transferAccount = await prisma.account.findUnique({
      where: { id: patch.transferAccountId ?? existing.transferAccountId ?? "" },
    });
    if (patch.transferAccountId === null || existing.transferAccountId === null) {
      // no-op
    } else {
      const target = transferAccount;
      if (!target) throw new Error("Destination account not found");
      if (target.id === accountId) throw new Error("Cannot transfer to the same account");
    }
  }

  let categoryId = existing.categoryId;
  const newType = patch.type ?? existing.type;
  if (newType === "income" || newType === "expense") {
    const resolved = await resolveCategory(
      userId,
      newType === "income" ? "income" : "expense",
      patch.categoryId,
      patch.categoryName,
      patch.description ?? existing.description ?? undefined,
    );
    if (resolved) categoryId = resolved;
  }

  const occurredAt = patch.date
    ? (() => {
        const m = patch.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) throw new Error("Invalid date format");
        const [, y, mo, d] = m;
        return zonedAt("UTC", +y, +mo - 1, +d);
      })()
    : patch.occurredAt
      ? new Date(patch.occurredAt)
      : existing.occurredAt;

  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      accountId,
      categoryId,
      type: patch.type ?? existing.type,
      amountMinor: patch.amount !== undefined ? toMinor(patch.amount) : existing.amountMinor,
      occurredAt,
      description:
        patch.description !== undefined
          ? patch.description.trim() || existing.description
          : existing.description,
      notes:
        patch.notes !== undefined
          ? patch.notes.trim() || existing.notes
          : existing.notes,
      paymentMethod:
        patch.paymentMethod !== undefined
          ? patch.paymentMethod.trim() || existing.paymentMethod
          : existing.paymentMethod,
      transferAccountId:
        patch.transferAccountId !== undefined
          ? (patch.transferAccountId ?? null)
          : existing.transferAccountId,
    },
  });

  await logAudit({
    userId,
    action: "update",
    entityType: "transaction",
    entityId: id,
    before,
    after: {
      type: updated.type,
      amountMinor: updated.amountMinor,
      categoryId: updated.categoryId,
      occurredAt: updated.occurredAt.toISOString(),
    },
  });

  return {
    transaction: updated,
    balance: await getCurrentBalance(userId),
  };
}

export async function deleteTransaction(userId: string, id: string, reason?: string) {
  const existing = await prisma.transaction.findFirst({
    where: { id, userId, deletedAt: null },
  });
  if (!existing) throw new Error("Transaction not found");

  await prisma.transaction.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await logAudit({
    userId,
    action: "delete",
    entityType: "transaction",
    entityId: id,
    before: { amountMinor: existing.amountMinor, type: existing.type },
    reason,
  });

  return { balance: await getCurrentBalance(userId) };
}

export async function listTransactions(
  userId: string,
  filters: {
    type?: string;
    from?: string;
    to?: string;
    categoryId?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  },
) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 40;
  const where: Record<string, unknown> = { userId, deletedAt: null };
  if (filters.type && filters.type !== "all") where.type = filters.type;
  if (filters.categoryId) where.categoryId = filters.categoryId;
const qFilter = filters.q
    ? { OR: [{ description: { contains: filters.q } }, { notes: { contains: filters.q } }] }
    : {};

  const dateFilter =
    filters.from || filters.to
      ? {
          occurredAt: {
            ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}),
            ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
          },
        }
      : {};

  const finalWhere: any = {
    ...where,
    ...qFilter,
    ...dateFilter,
  };

  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where: finalWhere,
      include: { category: true, account: true, transferAccount: true },
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where: finalWhere }),
  ]);

  return { rows, total, page, pageSize };
}

export async function getCurrentBalance(userId: string) {
  const [accounts, txns] = await Promise.all([
    prisma.account.findMany({ where: { userId, archived: false } }),
    prisma.transaction.findMany({ where: { userId, deletedAt: null } }),
  ]);
  const balances = accounts.map((a) => ({
    account: a,
    ...balanceForAccount(a.id, a.openingBalanceMinor, txns),
  }));
  const availableMinor = balances.reduce((s, b) => s + b.availableMinor, 0);
  return {
    accounts: balances,
    availableMinor,
    currency: accounts[0]?.currency ?? "PKR",
  };
}

export async function monthlySummary(
  userId: string,
  timezone: string,
  startDay: number,
  monthKeys: string[],
) {
  const { monthRange } = await import("@/lib/dates");
  const firstKey = monthKeys[0];
  const lastKey = monthKeys[monthKeys.length - 1];
  const range = monthRange(
    firstKey,
    timezone,
    startDay,
  );
  const lastRange = monthRange(lastKey, timezone, startDay);

  const txns = await prisma.transaction.findMany({
    where: {
      userId,
      deletedAt: null,
      occurredAt: { gte: range.start, lt: lastRange.endExclusive },
    },
    include: { category: true },
  });

  const result = monthKeys.map((mk) => {
    const r = monthRange(mk, timezone, startDay);
    const inMonth = txns.filter((t) => t.occurredAt >= r.start && t.occurredAt < r.endExclusive);
    let income = 0;
    let expense = 0;
    for (const t of inMonth) {
      if (t.type === "income" || t.type === "refund") income += t.amountMinor;
      if (t.type === "expense") expense += t.amountMinor;
    }
    return { monthKey: mk, incomeMinor: income, expenseMinor: expense };
  });

  return result;
}

export { periodKey };