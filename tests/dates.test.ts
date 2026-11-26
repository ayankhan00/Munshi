import { describe, it, expect } from "vitest";
import { formatInTimeZone } from "date-fns-tz";
import { intentMappedDate } from "@/lib/ai/executor";
import { dateKey, parseNaturalDateTime, dateRange } from "@/lib/dates";

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

describe("named dates and explicit ranges", () => {
  const tz = "Asia/Karachi";
  const now = new Date("2026-11-27T10:00:00.000Z");

  it("parses abbreviated month names, defaulting to the next occurrence", () => {
    const future = parseNaturalDateTime("on 1 nov", tz, now);
    expect(future && dateKey(future.date, tz)).toBe("2027-11-01");
    const past = parseNaturalDateTime("on 1 nov", tz, now, true);
    expect(past && dateKey(past.date, tz)).toBe("2026-11-01");
  });

  it("resolves a past range to inclusive start and exclusive end", () => {
    const range = dateRange("from 1 nov to 15 nov", tz, now);
    expect(range && dateKey(range.from, tz)).toBe("2026-11-01");
    expect(range && dateKey(range.toExclusive, tz)).toBe("2026-11-16");
  });

  it("keeps an end date later this month in the current year", () => {
    const range = dateRange("from 1 nov to 30 nov", tz, now);
    expect(range && dateKey(range.from, tz)).toBe("2026-11-01");
    expect(range && dateKey(range.toExclusive, tz)).toBe("2026-12-01");
  });

  it("prefers an upcoming range when both dates are still ahead", () => {
    const range = dateRange("from 1 dec to 15 dec", tz, now);
    expect(range && dateKey(range.from, tz)).toBe("2026-12-01");
    expect(range && dateKey(range.toExclusive, tz)).toBe("2026-12-16");
  });
});
