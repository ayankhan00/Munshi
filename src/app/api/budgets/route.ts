import { type NextRequest } from "next/server";
import { unwrapAsync, requireApiUser } from "@/lib/api";
import { budgetSetSchema } from "@/lib/validation";
import { setBudget, listBudgets, deleteBudget } from "@/lib/services/budgets";

export async function GET(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") ?? undefined;
    return listBudgets(user.id, user.timezone, user.financialMonthStartDay, period);
  });
}

export async function POST(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const body = await request.json().catch(() => ({}));
    const parsed = budgetSetSchema.parse(body);
    const result = await setBudget(user.id, {
      categoryId: parsed.categoryId,
      amount: parsed.amount,
      period: parsed.period,
      rollover: parsed.rollover,
    });
    return result;
  });
}

export async function DELETE(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) throw new Error("Missing id");
    return deleteBudget(user.id, id);
  });
}