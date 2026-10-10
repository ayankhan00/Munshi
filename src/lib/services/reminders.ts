import { prisma } from "@/lib/db";
import { parseNaturalDateTime, fnAddDays, fnAddMonths, fnAddWeeks } from "@/lib/dates";
import { formatInTimeZone } from "date-fns-tz";
import { notifyInApp, sendPushForUser } from "@/lib/notifications";
import { createHash } from "node:crypto";

export interface ReminderInput {
  title: string;
  body?: string;
  remindAt?: string;
  remind?: string;
  timezone?: string;
  type?: string;
  recurrence?: string;
  relatedTaskId?: string;
}

const RECURRENCES = ["none", "daily", "weekly", "monthly", "yearly"];

export function reminderDedupeKey(title: string, date: Date): string {
  const minute = Math.floor(date.getTime() / 60_000);
  return createHash("sha256")
    .update(`${title.toLowerCase()}|${minute}`)
    .digest("hex")
    .slice(0, 32);
}

export async function createReminder(userId: string, input: ReminderInput, defaultTz: string) {
  const timezone = input.timezone ?? defaultTz;
  let remindAt: Date;
  if (input.remindAt) {
    remindAt = new Date(input.remindAt);
  } else if (input.remind) {
    const parsed = parseNaturalDateTime(input.remind, timezone);
    if (!parsed) throw new Error("Could not understand the reminder time");
    remindAt = parsed.date;
  } else {
    throw new Error("remindAt or remind is required");
  }

  const recurrence = RECURRENCES.includes(input.recurrence ?? "none")
    ? (input.recurrence ?? "none")
    : "none";

  const dedupeKey = reminderDedupeKey(input.title, remindAt);

  const existing = await prisma.reminder.findUnique({
    where: { userId_dedupeKey: { userId, dedupeKey } },
  });
  if (existing) return { reminder: existing, duplicate: true };

  const reminder = await prisma.reminder.create({
    data: {
      userId,
      title: input.title,
      body: input.body ?? "",
      remindAt,
      timezone,
      type: input.type ?? "custom",
      recurrence,
      relatedTaskId: input.relatedTaskId,
      dedupeKey,
    },
  });
  return { reminder, duplicate: false };
}

export async function listReminders(
  userId: string,
  filters: { status?: string; from?: string; to?: string; upcomingOnly?: boolean } = {},
) {
  const where: Record<string, unknown> = { userId };
  if (filters.status && filters.status !== "all") where.status = filters.status;
  if (filters.upcomingOnly) {
    where.status = { in: ["pending"] };
    where.remindAt = { gte: new Date() };
  }
  const rows = await prisma.reminder.findMany({
    where,
    orderBy: { remindAt: "asc" },
    take: 200,
  });
  return { rows, total: rows.length };
}

export async function updateReminder(
  userId: string,
  id: string,
  input: Partial<ReminderInput> & { status?: string },
  defaultTz: string,
) {
  const existing = await prisma.reminder.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Reminder not found");

  let remindAt = existing.remindAt;
  if (input.remindAt) remindAt = new Date(input.remindAt);
  else if (input.remind) {
    const parsed = parseNaturalDateTime(input.remind, input.timezone ?? existing.timezone ?? defaultTz);
    if (!parsed) throw new Error("Could not understand the reminder time");
    remindAt = parsed.date;
  }

  const reminder = await prisma.reminder.update({
    where: { id },
    data: {
      title: input.title ?? existing.title,
      body: input.body ?? existing.body,
      remindAt,
      timezone: input.timezone ?? existing.timezone,
      type: input.type ?? existing.type,
      recurrence: input.recurrence ?? existing.recurrence,
      status: input.status ?? existing.status,
      relatedTaskId: input.relatedTaskId ?? existing.relatedTaskId,
    },
  });
  return reminder;
}

export async function deleteReminder(userId: string, id: string) {
  const existing = await prisma.reminder.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Reminder not found");
  await prisma.reminder.delete({ where: { id } });
  return { ok: true };
}

function nextOccurrence(date: Date, recurrence: string): Date | null {
  switch (recurrence) {
    case "daily":
      return fnAddDays(date, 1);
    case "weekly":
      return fnAddWeeks(date, 1);
    case "monthly":
      return fnAddMonths(date, 1);
    case "yearly":
      return fnAddMonths(date, 12);
    default:
      return null;
  }
}

export async function processDueReminders(now = new Date()) {
  const due = await prisma.reminder.findMany({
    where: { status: "pending", remindAt: { lte: now } },
    take: 200,
    orderBy: { remindAt: "asc" },
  });

  let sent = 0;
  for (const reminder of due) {
    const user = await prisma.user.findUnique({ where: { id: reminder.userId } });
    if (user?.notificationsEnabled !== false) {
      await notifyInApp(
        reminder.userId,
        reminder.title,
        reminder.body ?? undefined,
        reminder.type === "bill" || reminder.type === "budget" ? "warning" : "reminder",
        "/calendar",
        reminder.id,
      );
      await sendPushForUser(reminder.userId, {
        title: reminder.title,
        body: reminder.body ?? undefined,
        url: "/calendar",
      });
    }

    const next = reminder.recurrence
      ? nextOccurrence(reminder.remindAt, reminder.recurrence)
      : null;

    if (next) {
      const dedupeKey = reminderDedupeKey(reminder.title, next);
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { remindAt: next, lastSentAt: now, dedupeKey },
      }).catch(async () => {
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { status: "done", lastSentAt: now },
        });
      });
    } else {
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: "sent", lastSentAt: now },
      });
    }
    sent += 1;
  }

  return { checked: due.length, sent };
}

export { fnAddDays, fnAddMonths, fnAddWeeks, formatInTimeZone };

