import { describe, it, expect, afterAll } from "vitest";
import { makeUser, cleanupUsers } from "./helpers";
import {
  createTask,
  listTasks,
  updateTask,
  completeTask,
  deleteTask,
  agenda,
  moveTaskToDate,
} from "@/lib/services/tasks";
import { parseNaturalDateTime } from "@/lib/dates";

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

describe("tasks service", () => {
  it("normalizes invalid status and priority to safe defaults", async () => {
    const u = await user();
    const task = await createTask(
      u.id,
      { title: "Do the thing", status: "bogus", priority: "nonsense" },
      TZ,
    );
    expect(task.status).toBe("pending");
    expect(task.priority).toBe("medium");
  });

  it("derives dueAt from natural language", async () => {
    const u = await user();
    const task = await createTask(u.id, { title: "Pay bill", due: "tomorrow" }, TZ);
    expect(task.dueAt).not.toBeNull();
    const expected = parseNaturalDateTime("tomorrow", TZ)!.date;
    expect(task.dueAt!.getTime()).toBe(expected.getTime());
  });

  it("filters by status, including the 'all' escape hatch", async () => {
    const u = await user();
    const a = await createTask(u.id, { title: "pending one" }, TZ);
    const b = await createTask(u.id, { title: "done one" }, TZ);
    await completeTask(u.id, b.id, true);

    const pending = await listTasks(u.id, { status: "pending" });
    expect(pending.rows.map((r) => r.id)).toEqual([a.id]);

    const all = await listTasks(u.id, { status: "all" });
    expect(all.rows.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("searches titles and descriptions", async () => {
    const u = await user();
    await createTask(u.id, { title: "Buy groceries", description: "milk and eggs" }, TZ);
    await createTask(u.id, { title: "Call the bank" }, TZ);

    const byTitle = await listTasks(u.id, { q: "groceries" });
    expect(byTitle.total).toBe(1);

    const byDescription = await listTasks(u.id, { q: "eggs" });
    expect(byDescription.total).toBe(1);
  });

  it("sets and clears completedAt when toggling completion", async () => {
    const u = await user();
    const task = await createTask(u.id, { title: "toggle me" }, TZ);

    const done = await completeTask(u.id, task.id, true);
    expect(done.status).toBe("completed");
    expect(done.completedAt).not.toBeNull();

    const reopened = await completeTask(u.id, task.id, false);
    expect(reopened.status).toBe("pending");
    expect(reopened.completedAt).toBeNull();
  });

  it("stamps completedAt when status is updated to completed", async () => {
    const u = await user();
    const task = await createTask(u.id, { title: "update status" }, TZ);
    const updated = await updateTask(u.id, task.id, { status: "completed" }, TZ);
    expect(updated.completedAt).not.toBeNull();

    const cleared = await updateTask(u.id, task.id, { status: "pending" }, TZ);
    expect(cleared.completedAt).toBeNull();
  });

  it("refuses to mutate or delete another user's task", async () => {
    const a = await user();
    const b = await user();
    const task = await createTask(a.id, { title: "private" }, TZ);
    await expect(updateTask(b.id, task.id, { title: "hax" }, TZ)).rejects.toThrow(/not found/);
    await expect(deleteTask(b.id, task.id)).rejects.toThrow(/not found/);
  });

  it("deletes a task", async () => {
    const u = await user();
    const task = await createTask(u.id, { title: "delete me" }, TZ);
    await deleteTask(u.id, task.id);
    const { rows } = await listTasks(u.id, {});
    expect(rows.find((r) => r.id === task.id)).toBeUndefined();
  });

  it("buckets tasks into overdue, today and upcoming", async () => {
    const u = await user();
    const yesterday = parseNaturalDateTime("yesterday", TZ)!.date;
    const today = parseNaturalDateTime("today", TZ)!.date;
    const tomorrow = parseNaturalDateTime("tomorrow", TZ)!.date;

    await createTask(u.id, { title: "overdue", dueAt: yesterday.toISOString() }, TZ);
    await createTask(u.id, { title: "today", dueAt: today.toISOString() }, TZ);
    await createTask(u.id, { title: "upcoming", dueAt: tomorrow.toISOString() }, TZ);
    await createTask(u.id, { title: "no due" }, TZ);

    const result = await agenda(u.id, TZ);
    expect(result.counts.overdue).toBe(1);
    expect(result.counts.today).toBe(1);
    expect(result.upcoming.map((t) => t.title)).toEqual(["upcoming"]);
    expect(result.counts.pending).toBe(4);
  });

  it("moves a task to a natural date", async () => {
    const u = await user();
    const task = await createTask(u.id, { title: "reschedule" }, TZ);
    const moved = await moveTaskToDate(u.id, task.id, "tomorrow", TZ);
    const expected = parseNaturalDateTime("tomorrow", TZ)!.date;
    expect(moved.dueAt!.getTime()).toBe(expected.getTime());
  });
});
