import { type NextRequest } from "next/server";
import { unwrapAsync, requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { accountCreateSchema } from "@/lib/validation";
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
