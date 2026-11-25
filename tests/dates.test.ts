import { describe, it, expect } from "vitest";
import { formatInTimeZone } from "date-fns-tz";
import { intentMappedDate } from "@/lib/ai/executor";
import { dateKey, parseNaturalDateTime } from "@/lib/dates";

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

describe("calendar date validation", () => {
  const tz = "Asia/Karachi";

  it("keeps the 31st and rejects impossible dates", () => {
    const parsed = parseNaturalDateTime("2026-01-31", tz);
    expect(parsed && dateKey(parsed.date, tz)).toBe("2026-01-31");
    expect(() => parseNaturalDateTime("2026-02-30", tz)).toThrow("Invalid date");
  });
});

describe("today with a time across a DST change", () => {
  it("keeps the requested local hour on the spring-forward day", () => {
    const tz = "America/New_York";
    // 2026-03-08 01:00 EST; clocks jump to 03:00 EDT later that morning.
    const now = new Date("2026-03-08T06:00:00.000Z");
    const parsed = parseNaturalDateTime("today 9am", tz, now);
    expect(parsed).not.toBeNull();
    expect(formatInTimeZone(parsed!.date, tz, "yyyy-MM-dd HH:mm")).toBe("2026-03-08 09:00");
  });
});
