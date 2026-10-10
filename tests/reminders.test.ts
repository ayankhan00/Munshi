import { describe, it, expect, afterAll } from "vitest";
import { makeUser, cleanupUsers, wipeReminders, prisma } from "./helpers";
import {
  createReminder,
  listReminders,
  updateReminder,
  deleteReminder,
  processDueReminders,
  reminderDedupeKey,
} from "@/lib/services/reminders";

const createdUserIds: string[] = [];
async function user() {
  const u = await makeUser();
  createdUserIds.push(u.id);
  return u;
}

afterAll(async () => {
  await cleanupUsers(createdUserIds);
});

const TZ = "Asia/Karachi";

describe("reminders service", () => {
  it("creates a reminder from natural language", async () => {
    const u = await user();
    const { reminder, duplicate } = await createReminder(
      u.id,
      { title: "Call mom", remind: "in 2 hours" },
      TZ,
    );
    expect(duplicate).toBe(false);
    expect(reminder.remindAt.getTime()).toBeGreaterThan(Date.now());
    expect(reminder.status).toBe("pending");
  });

  it("deduplicates identical title + minute", async () => {
    const u = await user();
    const remindAt = "2031-06-01T10:00:00.000Z";
    const first = await createReminder(u.id, { title: "Pay bill", remindAt }, TZ);
    const second = await createReminder(u.id, { title: "Pay bill", remindAt }, TZ);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.reminder.id).toBe(first.reminder.id);

    const { total } = await listReminders(u.id);
    expect(total).toBe(1);
  });

  it("throws on an unparseable reminder time", async () => {
    const u = await user();
    await expect(
      createReminder(u.id, { title: "Nonsense", remind: "qwerty zxcv" }, TZ),
    ).rejects.toThrow(/understand the reminder time/);
  });

  it("lists upcoming reminders only", async () => {
    const u = await user();
    await createReminder(u.id, { title: "past", remindAt: "2020-01-01T00:00:00.000Z" }, TZ);
    await createReminder(u.id, { title: "future", remindAt: "2035-01-01T00:00:00.000Z" }, TZ);

    const all = await listReminders(u.id);
    expect(all.total).toBe(2);

    const upcoming = await listReminders(u.id, { upcomingOnly: true });
    expect(upcoming.rows.map((r) => r.title)).toEqual(["future"]);
  });

  it("sends due reminders once and marks them sent", async () => {
    await wipeReminders();
    const u = await user();
    const past = new Date(Date.now() - 60_000).toISOString();
    await createReminder(u.id, { title: "Drink water", remindAt: past, type: "custom" }, TZ);

    const first = await processDueReminders();
    expect(first.sent).toBe(1);

    const notifications = await prisma.inAppNotification.count({ where: { userId: u.id } });
    expect(notifications).toBe(1);

    const row = await prisma.reminder.findFirstOrThrow({ where: { userId: u.id } });
    expect(row.status).toBe("sent");
    expect(row.lastSentAt).not.toBeNull();

    const second = await processDueReminders();
    expect(second.checked).toBe(0);
    expect(second.sent).toBe(0);
  });

  it("rolls a recurring reminder forward without marking it done", async () => {
    await wipeReminders();
    const u = await user();
    const past = new Date(Date.now() - 60_000);
    await createReminder(
      u.id,
      { title: "Daily standup", remindAt: past.toISOString(), recurrence: "daily" },
      TZ,
    );

    await processDueReminders();

    const row = await prisma.reminder.findFirstOrThrow({ where: { userId: u.id } });
    expect(row.status).toBe("pending");
    expect(row.remindAt.getTime()).toBeGreaterThan(past.getTime());
    expect(row.remindAt.getTime()).toBeGreaterThan(Date.now());
    expect(row.dedupeKey).toBe(reminderDedupeKey(row.title, row.remindAt));

    const second = await processDueReminders();
    expect(second.checked).toBe(0);
  });

  it("reschedules and deletes reminders (with ownership checks)", async () => {
    const u = await user();
    const other = await user();
    const { reminder } = await createReminder(
      u.id,
      { title: "Renew licence", remindAt: "2032-01-01T09:00:00.000Z" },
      TZ,
    );

    const rescheduled = await updateReminder(
      u.id,
      reminder.id,
      { remindAt: "2032-02-01T09:00:00.000Z" },
      TZ,
    );
    expect(rescheduled.remindAt.toISOString()).toBe("2032-02-01T09:00:00.000Z");

    await expect(
      updateReminder(other.id, reminder.id, { title: "hax" }, TZ),
    ).rejects.toThrow(/not found/);
    await expect(deleteReminder(other.id, reminder.id)).rejects.toThrow(/not found/);

    await deleteReminder(u.id, reminder.id);
    const { total } = await listReminders(u.id);
    expect(total).toBe(0);
  });
});
