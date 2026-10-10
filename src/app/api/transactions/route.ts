import { type NextRequest } from "next/server";
import { unwrapAsync, requireApiUser } from "@/lib/api";
import { txCreateSchema, txUpdateSchema, txQuerySchema } from "@/lib/validation";
import {
  createTransaction,
  listTransactions,
  deleteTransaction,
  updateTransaction,
  getCurrentBalance,
} from "@/lib/services/transactions";
import { z } from "zod";

export async function GET(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const { searchParams } = new URL(request.url);
    const parsed = txQuerySchema.parse({
      type: searchParams.get("type") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      categoryId: searchParams.get("categoryId") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      page: searchParams.get("page") ? Number(searchParams.get("page")) : undefined,
      pageSize: searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : undefined,
    });
    const result = await listTransactions(user.id, parsed);
    return result;
  });
}

export async function POST(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const body = await request.json().catch(() => ({}));
    const parsed = txCreateSchema.parse(body);
    const result = await createTransaction(user.id, parsed);
    return result;
  });
}

export async function PUT(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const body = await request.json().catch(() => ({}));
    const { id, ...patch } = txUpdateSchema.parse(body);
    const result = await updateTransaction(user.id, id, patch);
    return result;
  });
}

export async function DELETE(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id || !z.string().cuid().safeParse(id).success) throw new Error("Missing id");
    const result = await deleteTransaction(user.id, id);
    return result;
  });
}