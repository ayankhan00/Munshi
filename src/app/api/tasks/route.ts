import { type NextRequest } from "next/server";
import { unwrapAsync, requireApiUser } from "@/lib/api";
import { taskCreateSchema, taskUpdateSchema, taskQuerySchema } from "@/lib/validation";
import { createTask, listTasks, updateTask, completeTask, deleteTask, agenda } from "@/lib/services/tasks";
import { z } from "zod";

export async function GET(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const { searchParams } = new URL(request.url);
    const agendaMode = searchParams.get("agenda");
    if (agendaMode === "1") {
      return agenda(user.id, user.timezone);
    }
    const parsed = taskQuerySchema.parse({
      status: searchParams.get("status") ?? undefined,
      priority: searchParams.get("priority") ?? undefined,
      q: searchParams.get("q") ?? undefined,
    });
    return listTasks(user.id, parsed);
  });
}

export async function POST(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const body = await request.json().catch(() => ({}));
    const parsed = taskCreateSchema.parse(body);
    const result = await createTask(user.id, parsed, user.timezone);
    return result;
  });
}

export async function PUT(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const body = await request.json().catch(() => ({}));
    const parsed = taskUpdateSchema.parse(body);
    const result = await updateTask(user.id, parsed.id, parsed, user.timezone);
    return result;
  });
}

export async function PATCH(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const body = await request.json().catch(() => ({}));
    const schema = z.object({ id: z.string().cuid(), completed: z.boolean().default(true) });
    const { id, completed } = schema.parse(body);
    return completeTask(user.id, id, completed);
  });
}

export async function DELETE(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) throw new Error("Missing id");
    return deleteTask(user.id, id);
  });
}