import { unwrapAsync, requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { installDefaultCategories } from "@/lib/services/transactions";

export async function POST() {
  return unwrapAsync(async () => {
    const user = await requireApiUser();

    // Delete all user-owned data except the profile/auth records. Order keeps
    // foreign keys satisfied (transactions before accounts, etc.).
    await prisma.$transaction([
      prisma.auditEvent.deleteMany({ where: { userId: user.id } }),
      prisma.notificationHistory.deleteMany({ where: { userId: user.id } }),
      prisma.inAppNotification.deleteMany({ where: { userId: user.id } }),
      prisma.pushSubscription.deleteMany({ where: { userId: user.id } }),
      prisma.aiMessage.deleteMany({ where: { userId: user.id } }),
      prisma.aiSession.deleteMany({ where: { userId: user.id } }),
      prisma.reminder.deleteMany({ where: { userId: user.id } }),
      prisma.transaction.deleteMany({ where: { userId: user.id } }),
      prisma.budget.deleteMany({ where: { userId: user.id } }),
      prisma.task.deleteMany({ where: { userId: user.id } }),
      prisma.recurringRule.deleteMany({ where: { userId: user.id } }),
      prisma.category.deleteMany({ where: { userId: user.id } }),
      prisma.account.deleteMany({ where: { userId: user.id } }),
    ]);

    // Restore the built-in categories so the app is usable immediately.
    await installDefaultCategories(user.id);

    return { cleared: true };
  });
}
