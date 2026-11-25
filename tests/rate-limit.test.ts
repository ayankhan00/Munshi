import { describe, it, expect, afterAll } from "vitest";
import { rateLimit, getClientIp } from "@/lib/http";
import { prisma } from "./helpers";

describe("shared rate limits", () => {
  const key = `test:${Date.now()}-${Math.random()}`;

  afterAll(async () => {
    await prisma.rateLimitCounter.deleteMany({ where: { key } });
  });

  it("counts calls in one shared counter", async () => {
    expect(await rateLimit(key, 2, 3_600_000)).toBe(true);
    expect(await rateLimit(key, 2, 3_600_000)).toBe(true);
    expect(await rateLimit(key, 2, 3_600_000)).toBe(false);
  });

  it("uses the Vercel-provided client IP only on Vercel", () => {
    const request = new Request("http://localhost/api", {
      headers: {
        "x-vercel-forwarded-for": "1.2.3.4",
        "x-forwarded-for": "9.9.9.9",
        "x-real-ip": "8.8.8.8",
      },
    });
    const original = process.env.VERCEL;
    process.env.VERCEL = "1";
    try {
      expect(getClientIp(request)).toBe("1.2.3.4");
    } finally {
      if (original === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = original;
    }
    // Spoofed forwarding headers must not create a fresh bucket off Vercel.
    expect(getClientIp(request)).toBe("unknown");
    expect(getClientIp(new Request("http://localhost/api", {
      headers: { "x-forwarded-for": "9.9.9.9", "x-real-ip": "8.8.8.8" },
    }))).toBe("unknown");
  });
});
