import { type NextRequest } from "next/server";
import { z } from "zod";
import { unwrapAsync, requireApiUser, ApiError } from "@/lib/api";
import { assertOrigin, rateLimit, getClientIp } from "@/lib/http";
import { prisma } from "@/lib/db";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().min(1).optional(),
});

export async function POST(request: NextRequest) {
  return unwrapAsync(async () => {
    if (!assertOrigin(request)) throw new ApiError(403, "Invalid origin.");
    const ip = getClientIp(request);
    if (!rateLimit(`push:subscribe:${ip}`, 30, 60_000)) {
      throw new ApiError(429, "Too many attempts. Try again later.");
    }
    const user = await requireApiUser();
    const body = await request.json().catch(() => ({}));
    const { endpoint, keys } = subscribeSchema.parse(body);
    const userAgent = request.headers.get("user-agent");

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        userId: user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent,
        disabled: false,
        lastSeenAt: new Date(),
      },
      create: {
        userId: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent,
      },
    });

    return { subscribed: true };
  });
}

export async function DELETE(request: NextRequest) {
  return unwrapAsync(async () => {
    if (!assertOrigin(request)) throw new ApiError(403, "Invalid origin.");
    const user = await requireApiUser();
    const body = await request.json().catch(() => ({}));
    const { endpoint } = unsubscribeSchema.parse(body);

    if (endpoint) {
      await prisma.pushSubscription.deleteMany({ where: { userId: user.id, endpoint } });
    } else {
      await prisma.pushSubscription.deleteMany({ where: { userId: user.id } });
    }

    return { subscribed: false };
  });
}
