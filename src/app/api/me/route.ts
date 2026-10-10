import { type NextRequest } from "next/server";
import { unwrapAsync, requireApiUser } from "@/lib/api";
import { settingsSchema } from "@/lib/validation";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";

export async function GET(_request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        name: true,
        currency: true,
        timezone: true,
        monthlySalaryMinor: true,
        salaryDay: true,
        openingBalanceMinor: true,
        savingsGoalMinor: true,
        financialMonthStartDay: true,
        notificationsEnabled: true,
        quietHoursStart: true,
        quietHoursEnd: true,
        theme: true,
        demoMode: true,
      },
    });
    return profile;
  });
}

export async function PUT(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const body = await request.json().catch(() => ({}));
    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new (require("@/lib/api").ApiError)(422, first ? first.message : "Invalid input");
    }
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: parsed.data,
    });
    return updated;
  });
}