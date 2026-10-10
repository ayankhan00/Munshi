import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { DEFAULT_CATEGORIES } from "@/lib/categories";

async function main() {
  const email = "demo@local.test";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("Seed: demo user already exists");
    return;
  }
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: hashPassword("password123"),
      name: "Demo",
      openingBalanceMinor: 0,
      monthlySalaryMinor: 150_000 * 100,
      salaryDay: 1,
      timezone: "Asia/Karachi",
    },
  });
  await prisma.account.create({
    data: { userId: user.id, name: "Cash", type: "cash", isDefault: true, currency: "PKR", openingBalanceMinor: 0 },
  });
  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({ ...c, userId: user.id, isSystem: true })),
  });
  console.log("Seed: created demo user demo@local.test / password123");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });