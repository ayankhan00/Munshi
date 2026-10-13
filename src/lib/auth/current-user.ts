import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getSessionUser } from "@/lib/auth/sessions";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  currency: string;
  timezone: string;
  monthlySalaryMinor: number;
  salaryDay: number;
  openingBalanceMinor: number;
  savingsGoalMinor: number;
  financialMonthStartDay: number;
  notificationsEnabled: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  theme: string;
  demoMode: boolean;
};

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(env().sessionCookieName)?.value;
  if (!token) return null;
  const user = await getSessionUser(token);
  if (!user) return null;
  return prisma.user.findUnique({
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
});
