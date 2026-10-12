import { type NextRequest } from "next/server";
import { z } from "zod";
import { unwrapAsync, requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { categoryCreateSchema, categoryUpdateSchema } from "@/lib/validation";
import { installDefaultCategories } from "@/lib/services/transactions";

export async function GET(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const { searchParams } = new URL(request.url);
    const kind = searchParams.get("kind");
    await installDefaultCategories(user.id);
    const where: Record<string, unknown> = { userId: user.id, archived: false };
    if (kind === "income" || kind === "expense") where.kind = kind;
    const rows = await prisma.category.findMany({
      where,
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    });
    return { rows, total: rows.length };
  });
}

export async function POST(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const body = await request.json().catch(() => ({}));
    const parsed = categoryCreateSchema.parse(body);
    const existing = await prisma.category.findFirst({
      where: { userId: user.id, name: parsed.name, kind: parsed.kind },
    });
    if (existing) {
      const category = await prisma.category.update({
        where: { id: existing.id },
        data: { archived: false, color: parsed.color, icon: parsed.icon },
      });
      return category;
    }
    const category = await prisma.category.create({
      data: {
        userId: user.id,
        name: parsed.name,
        kind: parsed.kind,
        color: parsed.color,
        icon: parsed.icon,
        isSystem: false,
      },
    });
    return category;
  });
}

export async function PATCH(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id || !z.string().cuid().safeParse(id).success) throw new Error("Missing id");
    const body = await request.json().catch(() => ({}));
    const parsed = categoryUpdateSchema.parse(body);
    const existing = await prisma.category.findFirst({ where: { id, userId: user.id } });
    if (!existing) throw new Error("Category not found");
    if (parsed.name && parsed.name !== existing.name) {
      const clash = await prisma.category.findFirst({
        where: {
          userId: user.id,
          name: parsed.name,
          kind: parsed.kind ?? existing.kind,
          id: { not: id },
        },
      });
      if (clash) throw new Error("A category with that name already exists");
    }
    const category = await prisma.category.update({
      where: { id },
      data: {
        name: parsed.name ?? undefined,
        color: parsed.color ?? undefined,
        icon: parsed.icon ?? undefined,
      },
    });
    return category;
  });
}

export async function DELETE(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id || !z.string().cuid().safeParse(id).success) throw new Error("Missing id");
    const existing = await prisma.category.findFirst({ where: { id, userId: user.id } });
    if (!existing) throw new Error("Category not found");
    await prisma.category.update({ where: { id }, data: { archived: true } });
    return { archived: true };
  });
}
