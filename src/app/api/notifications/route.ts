import { type NextRequest } from "next/server";
import { unwrapAsync, requireApiUser } from "@/lib/api";
import {
  getInAppNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  clearNotifications,
} from "@/lib/notifications";
import { z } from "zod";

export async function GET(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const { searchParams } = new URL(request.url);
    const rawLimit = Number(searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(100, Math.max(1, Math.floor(rawLimit)))
      : 50;
    return getInAppNotifications(user.id, {
      unreadOnly: searchParams.get("unread") === "1",
      limit,
    });
  });
}

export async function PATCH(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const body = await request.json().catch(() => ({}));
    const schema = z.object({
      id: z.string().cuid().optional(),
      all: z.boolean().optional(),
    });
    const { id, all } = schema.parse(body);
    if (all) return markAllNotificationsRead(user.id);
    if (!id) throw new Error("Missing id");
    return markNotificationRead(user.id, id);
  });
}

export async function DELETE(_request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    return clearNotifications(user.id);
  });
}
