import { type NextRequest } from "next/server";
import { unwrapAsync, requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { categoryCreateSchema } from "@/lib/validation";
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
