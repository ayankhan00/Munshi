import { prisma } from "@/lib/db";
import { parseNaturalDateTime, startOfDayZoned, fnAddDays, fnAddMonths, fnAddWeeks } from "@/lib/dates";
import { formatInTimeZone } from "date-fns-tz";
import { logAudit } from "@/lib/audit";

export interface TaskInput {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  dueAt?: string;
  due?: string;
  tags?: string;
}

function normalizeStatus(status: string): string {
  const valid = ["pending", "in_progress", "completed", "cancelled"];
  return valid.includes(status) ? status : "pending";
}

function normalizePriority(priority: string): string {
  const valid = ["low", "medium", "high", "urgent"];
  return valid.includes(priority) ? priority : "medium";
}

async function deriveDueAt(input: TaskInput, tz: string): Promise<Date | undefined> {
  if (input.dueAt) return new Date(input.dueAt);
  if (input.due) {
    const parsed = parseNaturalDateTime(input.due, tz);
    return parsed?.date;
  }
  return undefined;
}

export async function createTask(userId: string, input: TaskInput, timezone: string) {
  const dueAt = await deriveDueAt(input, timezone);
  const task = await prisma.task.create({
    data: {
      userId,
      title: input.title,
      description: input.description?.trim() || input.description || undefined,
      status: normalizeStatus(input.status ?? "pending"),
      priority: normalizePriority(input.priority ?? "medium"),
      dueAt,
      tags: input.tags ?? "",
    },
  });
  await logAudit({ userId, action: "create", entityType: "task", entityId: task.id });
  return task;
}

export async function updateTask(userId: string, id: string, input: Partial<TaskInput>, timezone: string) {
  const existing = await prisma.task.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Task not found");
  const dueAt = input.due !== undefined || input.dueAt !== undefined
    ? await deriveDueAt({ ...existing, ...input } as TaskInput, timezone)
    : existing.dueAt;

  const completedAt =
    input.status === "completed" && existing.status !== "completed"
      ? new Date()
      : input.status !== undefined && input.status !== "completed"
        ? null
        : input.status === "completed"
          ? (existing.completedAt ?? new Date())
          : existing.completedAt;

  const task = await prisma.task.update({
    where: { id },
    data: {
      title: input.title ?? existing.title,
      description:
        input.description !== undefined ? input.description?.trim() || existing.description : existing.description,
      status: input.status ? normalizeStatus(input.status) : existing.status,
      priority: input.priority ? normalizePriority(input.priority) : existing.priority,
      dueAt,
      completedAt,
      tags: input.tags ?? existing.tags,
    },
  });
  await logAudit({ userId, action: "update", entityType: "task", entityId: id });
  return task;
}

export async function completeTask(userId: string, id: string, completed = true) {
  const existing = await prisma.task.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Task not found");
  const task = await prisma.task.update({
    where: { id },
    data: { status: completed ? "completed" : "pending", completedAt: completed ? new Date() : null },
  });
  await logAudit({ userId, action: "update", entityType: "task", entityId: id });
  return task;
}

export async function deleteTask(userId: string, id: string) {
  const existing = await prisma.task.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Task not found");
  await prisma.task.delete({ where: { id } });
  await logAudit({ userId, action: "delete", entityType: "task", entityId: id });
  return { ok: true };
}

export async function listTasks(
  userId: string,
  filters: {
    status?: string;
    priority?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  },
) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const where: Record<string, unknown> = { userId };
  if (filters.status && filters.status !== "all") where.status = filters.status;
  if (filters.priority && filters.priority !== "all") where.priority = filters.priority;
  if (filters.q) {
    where.OR = [{ title: { contains: filters.q } }, { description: { contains: filters.q } }];
  }
  const [rows, total] = await Promise.all([
    prisma.task.findMany({ where, orderBy: [{ status: "asc" }, { dueAt: "asc" }] }),
    prisma.task.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}

export async function agenda(userId: string, tz: string) {
  const nowKey = formatInTimeZone(new Date(), tz, "yyyy-MM-dd");
  const startOfToday = startOfDayZoned(new Date(), tz);

  const all = await prisma.task.findMany({
    where: {
      userId,
      status: { in: ["pending", "in_progress"] },
      dueAt: { not: null },
    },
    orderBy: { dueAt: "asc" },
  });

  const overdue = all.filter((t) => t.dueAt! < startOfToday);
  const today = all.filter(
    (t) => formatInTimeZone(t.dueAt!, tz, "yyyy-MM-dd") === nowKey,
  );
  const upcoming = all.filter(
    (t) => formatInTimeZone(t.dueAt!, tz, "yyyy-MM-dd") !== nowKey && t.dueAt! >= startOfToday,
  );
  const counts = {
    overdue: overdue.length,
    today: today.length,
    pending: await prisma.task.count({ where: { userId, status: "pending" } }),
    inProgress: await prisma.task.count({ where: { userId, status: "in_progress" } }),
    completed: await prisma.task.count({ where: { userId, status: "completed" } }),
  };

  return { overdue, today, upcoming, counts };
}

export async function moveTaskToDate(userId: string, id: string, naturalDate: string, tz: string) {
  const parsed = parseNaturalDateTime(naturalDate, tz);
  if (!parsed) throw new Error("Could not understand the date");
  return updateTask(userId, id, { dueAt: parsed.date.toISOString() }, tz);
}

export { fnAddDays, fnAddMonths, fnAddWeeks };