-- Running per-account balances, maintained by transaction writes.
ALTER TABLE "Account" ADD COLUMN "availableMinor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Account" ADD COLUMN "incomeMinor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Account" ADD COLUMN "expenseMinor" INTEGER NOT NULL DEFAULT 0;

-- Accounts with no transactions must still start at their opening balance.
UPDATE "Account" SET "availableMinor" = "openingBalanceMinor";

-- Backfill from existing transactions, mirroring the ledger rules.
WITH contributions AS (
  SELECT
    "accountId" AS "accountId",
    CASE WHEN "type" IN ('income', 'refund') THEN "amountMinor" ELSE 0 END AS "income",
    CASE WHEN "type" = 'expense' THEN "amountMinor" ELSE 0 END AS "expense",
    CASE
      WHEN "type" IN ('income', 'refund', 'adjustment') THEN "amountMinor"
      WHEN "type" = 'expense' THEN -"amountMinor"
      ELSE 0
    END AS "delta"
  FROM "Transaction"
  WHERE "deletedAt" IS NULL
  UNION ALL
  SELECT
    "transferAccountId" AS "accountId",
    0 AS "income",
    0 AS "expense",
    "amountMinor" AS "delta"
  FROM "Transaction"
  WHERE "deletedAt" IS NULL AND "type" = 'transfer' AND "transferAccountId" IS NOT NULL
), totals AS (
  SELECT
    "accountId",
    SUM("income") AS "income",
    SUM("expense") AS "expense",
    SUM("delta") AS "delta"
  FROM contributions
  GROUP BY "accountId"
)
UPDATE "Account" AS a
SET
  "incomeMinor" = COALESCE(t."income", 0),
  "expenseMinor" = COALESCE(t."expense", 0),
  "availableMinor" = a."openingBalanceMinor" + COALESCE(t."delta", 0)
FROM totals AS t
WHERE a."id" = t."accountId";
