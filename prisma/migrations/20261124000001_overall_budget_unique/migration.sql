-- NULLs are distinct in Postgres unique indexes, so the existing composite
-- unique key cannot enforce one category-less ("overall") budget per period.
CREATE UNIQUE INDEX "Budget_userId_period_overall_key"
  ON "Budget"("userId", "period") WHERE "categoryId" IS NULL;
