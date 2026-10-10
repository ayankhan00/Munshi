import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address")
  .max(254);

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().max(100).optional().default(""),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const resetRequestSchema = z.object({ email: emailSchema });

export const resetConfirmSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export const txTypes = [
  "income",
  "expense",
  "transfer",
  "refund",
  "adjustment",
] as const;

export const txCreateSchema = z
  .object({
    type: z.enum(txTypes),
    amount: z.number().finite().refine(
      (n) => Math.abs(n) > 0 && Math.abs(n) < 1e10,
      "Amount must be greater than zero",
    ),
    description: z.string().trim().max(200).optional().default(""),
    notes: z.string().trim().max(1000).optional().default(""),
    paymentMethod: z.string().trim().max(60).optional(),
    categoryId: z.string().cuid().optional(),
    categoryName: z.string().trim().max(60).optional(),
    accountId: z.string().cuid().optional(),
    transferAccountId: z.string().cuid().optional(),
    date: z.string().optional().describe("YYYY-MM-DD in the user's timezone"),
    occurredAt: z.string().datetime().optional(),
    idempotencyKey: z.string().min(8).max(128).optional(),
    reason: z.string().trim().max(500).optional(),
    sourceTransactionId: z.string().cuid().optional(),
    recurringRuleId: z.string().cuid().optional(),
  })
  .strict();

export const txUpdateSchema = txCreateSchema
  .partial()
  .extend({ id: z.string().cuid() })
  .strict();

export const txQuerySchema = z.object({
  type: z.enum([...txTypes, "all"]).default("all"),
  from: z.string().optional(),
  to: z.string().optional(),
  categoryId: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(40),
});

export const taskStatuses = [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export const priorities = ["low", "medium", "high", "urgent"] as const;

export const taskCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional().default(""),
    status: z.enum(taskStatuses).optional().default("pending"),
    priority: z.enum(priorities).optional().default("medium"),
    dueAt: z.string().datetime().optional(),
    due: z.string().optional().describe("natural language due date"),
    tags: z.string().trim().max(300).optional().default(""),
  })
  .strict();

export const taskUpdateSchema = taskCreateSchema
  .partial()
  .extend({ id: z.string().cuid() })
  .strict();

export const taskQuerySchema = z.object({
  status: z.enum([...taskStatuses, "all"]).default("all"),
  priority: z.enum([...priorities, "all"]).default("all"),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const reminderCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().max(1000).optional().default(""),
    remindAt: z.string().datetime().optional(),
    remind: z.string().optional().describe("natural language reminder time"),
    timezone: z.string().max(60).optional(),
    type: z.enum(["bill", "task", "salary", "budget", "custom"]).optional().default("custom"),
    recurrence: z.enum(["none", "daily", "weekly", "monthly", "yearly"]).optional().default("none"),
    relatedTaskId: z.string().cuid().optional(),
  })
  .strict();

export const reminderUpdateSchema = reminderCreateSchema
  .partial()
  .extend({ id: z.string().cuid() })
  .strict();

export const budgetSetSchema = z.object({
  categoryId: z.string().cuid().optional(),
  amount: z.number().finite().positive().refine(
    (n) => Math.abs(n) < 1e10,
    "Amount too large",
  ),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  rollover: z.boolean().optional().default(false),
});

export const settingsSchema = z
  .object({
    name: z.string().trim().max(100).optional(),
    currency: z.string().length(3).toUpperCase().optional(),
    timezone: z.string().max(60).optional(),
    monthlySalaryMinor: z.number().int().min(0).optional(),
    salaryDay: z.number().int().min(1).max(28).optional(),
    openingBalanceMinor: z.number().int().optional(),
    savingsGoalMinor: z.number().int().min(0).optional(),
    financialMonthStartDay: z.number().int().min(1).max(28).optional(),
    notificationsEnabled: z.boolean().optional(),
    quietHoursStart: z.number().int().min(0).max(23).nullable().optional(),
    quietHoursEnd: z.number().int().min(0).max(23).nullable().optional(),
    theme: z.enum(["system", "light", "dark"]).optional(),
  })
  .strict();

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(["income", "expense"]).default("expense"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#64748b"),
  icon: z.string().max(40).optional(),
});

export const accountCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  type: z.enum(["cash", "bank", "wallet", "credit", "other"]).default("cash"),
  openingBalanceMinor: z.number().int().optional().default(0),
  currency: z.string().length(3).toUpperCase().default("PKR"),
  isDefault: z.boolean().optional().default(false),
});

export const aiMessageSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  sessionId: z.string().cuid().optional(),
});

export const confirmSchema = z.object({
  confirmation: z.enum(["yes", "proceed", "confirm"]),
  actionKey: z.string().min(1).max(200),
});