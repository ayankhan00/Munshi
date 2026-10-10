import { describe, it, expect } from "vitest";
import { intentMappedDate } from "@/lib/ai/executor";

describe("assistant relative dates use the user's timezone", () => {
  const tz = "Asia/Karachi";
  // 2026-10-11 03:00 in Karachi, but still 2026-10-10 in UTC.
  const now = new Date("2026-10-10T22:00:00.000Z");

  it("resolves today/yesterday/tomorrow against the local calendar date", () => {
    expect(intentMappedDate("today", tz, now)).toBe("2026-10-11");
    expect(intentMappedDate("yesterday", tz, now)).toBe("2026-10-10");
    expect(intentMappedDate("tomorrow", tz, now)).toBe("2026-10-12");
  });

  it("returns undefined when there is no date or timezone", () => {
    expect(intentMappedDate(undefined, tz, now)).toBeUndefined();
    expect(intentMappedDate("yesterday", undefined, now)).toBeUndefined();
  });
});
