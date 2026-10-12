import { type NextRequest } from "next/server";
import { z } from "zod";
import { unwrapAsync, requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { accountCreateSchema, accountUpdateSchema } from "@/lib/validation";
import { balanceForAccount } from "@/lib/ledger";
import { getDefaultAccount } from "@/lib/services/transactions";

export async function GET(_request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    await getDefaultAccount(user.id);
    const accounts = await prisma.account.findMany({
      where: { userId: user.id, archived: false },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    const txns = await prisma.transaction.findMany({
      where: { userId: user.id, deletedAt: null },
    });
    const rows = accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      currency: a.currency,
      isDefault: a.isDefault,
      openingBalanceMinor: a.openingBalanceMinor,
      ...balanceForAccount(a.id, a.openingBalanceMinor, txns),
    }));
    return { rows, total: rows.length };
  });
}

export async function POST(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const body = await request.json().catch(() => ({}));
    const parsed = accountCreateSchema.parse(body);
    if (parsed.isDefault) {
      await prisma.account.updateMany({
        where: { userId: user.id },
        data: { isDefault: false },
      });
    }
    const account = await prisma.account.create({
      data: {
        userId: user.id,
        name: parsed.name,
        type: parsed.type,
        currency: parsed.currency,
        openingBalanceMinor: parsed.openingBalanceMinor ?? 0,
        isDefault: parsed.isDefault ?? false,
      },
    });
    return account;
  });
}

export async function PATCH(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id || !z.string().cuid().safeParse(id).success) throw new Error("Missing id");
    const body = await request.json().catch(() => ({}));
    const parsed = accountUpdateSchema.parse(body);
    const existing = await prisma.account.findFirst({ where: { id, userId: user.id } });
    if (!existing) throw new Error("Account not found");
    if (parsed.isDefault) {
      await prisma.account.updateMany({
        where: { userId: user.id },
        data: { isDefault: false },
      });
    }
    const account = await prisma.account.update({
      where: { id },
      data: {
        name: parsed.name ?? undefined,
        type: parsed.type ?? undefined,
        currency: parsed.currency ?? undefined,
        openingBalanceMinor: parsed.openingBalanceMinor ?? undefined,
        isDefault: parsed.isDefault ?? undefined,
        archived: parsed.archived ?? undefined,
      },
    });
    return account;
  });
}

export async function DELETE(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id || !z.string().cuid().safeParse(id).success) throw new Error("Missing id");
    const account = await prisma.account.findFirst({ where: { id, userId: user.id } });
    if (!account) throw new Error("Account not found");
    const activeCount = await prisma.account.count({
      where: { userId: user.id, archived: false },
    });
    if (activeCount <= 1) throw new Error("You need at least one active account");
    const fallback = await prisma.account.findFirst({
      where: { userId: user.id, archived: false, id: { not: id } },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    await prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id },
        data: { archived: true, isDefault: false },
      });
      if (account.isDefault && fallback) {
        await tx.account.update({
          where: { id: fallback.id },
          data: { isDefault: true },
        });
      }
    });
    return { archived: true };
  });
}
