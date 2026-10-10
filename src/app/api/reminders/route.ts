import { type NextRequest } from "next/server";
import { unwrapAsync, requireApiUser } from "@/lib/api";
import { reminderCreateSchema, reminderUpdateSchema } from "@/lib/validation";
import {
  createReminder,
  listReminders,
  updateReminder,
  deleteReminder,
} from "@/lib/services/reminders";
import { z } from "zod";

export async function GET(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const { searchParams } = new URL(request.url);
    return listReminders(user.id, {
      status: searchParams.get("status") ?? undefined,
      upcomingOnly: searchParams.get("upcoming") === "1",
    });
  });
}

export async function POST(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const body = await request.json().catch(() => ({}));
    const parsed = reminderCreateSchema.parse(body);
    return createReminder(user.id, parsed, user.timezone);
  });
}

export async function PUT(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const body = await request.json().catch(() => ({}));
    const parsed = reminderUpdateSchema.parse(body);
    const { id, ...rest } = parsed;
    return updateReminder(user.id, id, rest, user.timezone);
  });
}

export async function PATCH(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const body = await request.json().catch(() => ({}));
    const schema = z.object({
      id: z.string().cuid(),
      status: z.enum(["pending", "sent", "cancelled", "done"]),
    });
    const { id, status } = schema.parse(body);
    return updateReminder(user.id, id, { status }, user.timezone);
  });
}

export async function DELETE(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) throw new Error("Missing id");
    return deleteReminder(user.id, id);
  });
}
