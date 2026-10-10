import { prisma } from "@/lib/db";
import { installDefaultCategories, getDefaultAccount } from "@/lib/services/transactions";

export { prisma };

let counter = 0;

export async function makeUser(overrides: Record<string, unknown> = {}) {
  counter += 1;
  const nonce = `${Date.now()}-${counter}-${Math.random().toString(36).slice(2, 8)}`;
  const user = await prisma.user.create({
    data: {
      email: `test-${nonce}@example.com`,
      passwordHash: "not-a-real-hash",
      timezone: "Asia/Karachi",
      ...overrides,
    },
  });
  await installDefaultCategories(user.id);
  await getDefaultAccount(user.id);
  return user;
}

export async function cleanupUsers(userIds: string[]) {
  for (const id of userIds) {
    await prisma.user.delete({ where: { id } }).catch(() => undefined);
  }
}

export async function wipeReminders() {
  await prisma.notificationHistory.deleteMany({});
  await prisma.inAppNotification.deleteMany({});
  await prisma.reminder.deleteMany({});
}

export async function expenseCategory(userId: string, name = "Food/Drink") {
  const cat = await prisma.category.findFirst({
    where: { userId, kind: "expense", name },
  });
  if (!cat) throw new Error(`Expense category ${name} not found`);
  return cat;
}
