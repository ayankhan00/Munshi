import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export async function notifyInApp(
  userId: string,
  title: string,
  body?: string,
  type = "info",
  url?: string,
  reminderId?: string,
) {
  const notification = await prisma.inAppNotification.create({
    data: { userId, title, body, type, url },
  });
  await prisma.notificationHistory.create({
    data: {
      userId,
      reminderId,
      title,
      body,
      channel: "inapp",
      status: "sent",
    },
  });
  return notification;
}

export async function getInAppNotifications(
  userId: string,
  opts: { unreadOnly?: boolean; limit?: number } = {},
) {
  const limit = opts.limit ?? 50;
  const rows = await prisma.inAppNotification.findMany({
    where: { userId, readAt: opts.unreadOnly ? null : undefined },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const unread = await prisma.inAppNotification.count({
    where: { userId, readAt: null },
  });
  return { rows, unread };
}

export async function markNotificationRead(userId: string, id: string) {
  await prisma.inAppNotification.updateMany({
    where: { id, userId },
    data: { readAt: new Date() },
  });
  return { ok: true };
}

export async function markAllNotificationsRead(userId: string) {
  await prisma.inAppNotification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { ok: true };
}

export async function clearNotifications(userId: string) {
  await prisma.inAppNotification.deleteMany({ where: { userId } });
  return { ok: true };
}

export function pushConfigured(): boolean {
  return Boolean(
    env().vapidPublicKey &&
      env().vapidPrivateKey &&
      env().vapidSubject,
  );
}

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
}

export async function sendPushForUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: boolean }> {
  if (!pushConfigured()) return { sent: false };
  const subs = await prisma.pushSubscription.findMany({
    where: { userId, disabled: false },
  });
  if (subs.length === 0) return { sent: false };

  let sent = false;
  for (const sub of subs) {
    try {
      const { default: webpush } = await import("web-push");
      webpush.setVapidDetails(
        env().vapidSubject,
        env().vapidPublicKey,
        env().vapidPrivateKey,
      );
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({
          title: payload.title,
          body: payload.body ?? "",
          url: payload.url ?? "/",
          ts: Date.now(),
        }),
        { TTL: 60 * 60 * 24 },
      );
      sent = true;
      await prisma.pushSubscription.update({
        where: { id: sub.id },
        data: { lastSeenAt: new Date() },
      });
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { disabled: true },
        });
      }
    }
  }
  return { sent };
}