import { type NextRequest } from "next/server";
import { unwrapAsync, requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { toCsv, csvBlob } from "@/lib/csv";
import { currentMonthKey, monthRange } from "@/lib/dates";

export async function GET(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const monthParam = searchParams.get("month");
    const mk =
      monthParam && /^\d{4}-\d{2}$/.test(monthParam)
        ? monthParam
        : currentMonthKey(user.timezone);
    const range = monthRange(mk, user.timezone, user.financialMonthStartDay);
    const start = from ? new Date(`${from}T00:00:00Z`) : range.start;
    const end = to ? new Date(`${to}T23:59:59Z`) : range.endExclusive;

    const txns = await prisma.transaction.findMany({
      where: { userId: user.id, deletedAt: null, occurredAt: { gte: start, lt: end } },
      include: { category: true, account: true },
      orderBy: { occurredAt: "desc" },
    });

    const headers = [
      "id",
      "type",
      "amountMinor",
      "amountMajor",
      "currency",
      "occurredAt",
      "description",
      "notes",
      "category",
      "account",
    ];
    const rows = txns.map((t) => [
      t.id,
      t.type,
      t.amountMinor,
      t.amountMinor / 100,
      t.currency,
      t.occurredAt.toISOString(),
      t.description,
      t.notes,
      t.category?.name,
      t.account?.name,
    ]);

    return new Response(csvBlob(toCsv(headers, rows)), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="transactions_${mk}.csv"`,
      },
    });
  });
}