import {
  addDays as fnAddDays,
  addMonths as fnAddMonths,
  addWeeks as fnAddWeeks,
  startOfDay,
} from "date-fns";
import { fromZonedTime, toZonedTime, formatInTimeZone } from "date-fns-tz";
import { env } from "@/lib/env";

export function tzOf(user?: { timezone?: string } | null): string {
  return user?.timezone ?? env().defaultTz;
}

export function zonedAt(
  tz: string,
  year: number,
  month: number, // 0-indexed
  day: number,
  hour = 0,
  minute = 0,
): Date {
  const y = String(year).padStart(4, "0");
  const mo = String(month + 1).padStart(2, "0");
  const d = String(Math.max(1, Math.min(day, 28))).padStart(2, "0");
  const h = String(hour).padStart(2, "0");
  const mi = String(minute).padStart(2, "0");
  return fromZonedTime(`${y}-${mo}-${d}T${h}:${mi}:00`, tz);
}

export function nowZoned(tz: string): Date {
  return toZonedTime(new Date(), tz);
}

export function startOfDayZoned(date: Date, tz: string): Date {
  return fromZonedTime(
    formatInTimeZone(date, tz, "yyyy-MM-dd'T'00:00:00"),
    tz,
  );
}

export function periodKey(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "yyyy-MM");
}

export function monthRange(
  monthKey: string, // "YYYY-MM"
  tz: string,
  startDay = 1,
): { start: Date; endExclusive: Date } {
  const [y, m] = monthKey.split("-").map(Number);
  const start = zonedAt(tz, y, m - 1, startDay);
  const endExclusive = zonedAt(tz, y + (m === 12 ? 1 : 0), m === 12 ? 0 : m, startDay);
  return { start, endExclusive };
}

export function currentMonthKey(tz: string): string {
  return formatInTimeZone(new Date(), tz, "yyyy-MM");
}

export function formatDateTime(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "MMM d, yyyy h:mm a");
}

export function dateKey(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "yyyy-MM-dd");
}

export function formatDate(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "MMM d, yyyy");
}

export function formatTime(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "h:mm a");
}

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

export interface NaturalDateTime {
  date: Date; // UTC
  hadDate: boolean;
  hadTime: boolean;
}

const TIME_WORDS: Record<string, { hour: number; minute: number }> = {
  midnight: { hour: 0, minute: 0 },
  morning: { hour: 9, minute: 0 },
  afternoon: { hour: 15, minute: 0 },
  evening: { hour: 18, minute: 0 },
  night: { hour: 21, minute: 0 },
};

export function parseClockTime(
  text: string,
): { hour: number; minute: number } | null {
  const m = text.match(
    /(?:^|\s)(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\b/i,
  );
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const mer = (m[3] ?? "").toLowerCase();
  if (mer.startsWith("a")) {
    if (hour === 12) hour = 0;
  } else if (mer.startsWith("p")) {
    if (hour !== 12) hour += 12;
  } else if (!m[2] && m[1].length >= 4) {
    return null;
  }
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export function clockFromTimeWord(text: string): { hour: number; minute: number } | null {
  const lower = text.toLowerCase();
  for (const [word, time] of Object.entries(TIME_WORDS)) {
    if (lower.includes(word) && !lower.includes(`${word} of`)) {
      return time;
    }
  }
  return null;
}

export function parseNaturalDateTime(
  raw: string,
  tz: string,
  now = new Date(),
): NaturalDateTime | null {
  const text = raw.toLowerCase();
  const time = clockFromTimeWord(text) ?? parseClockTime(text);

  const strict = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (strict) {
    const [, y, mo, d] = strict;
    const base = fromZonedTime(`${y}-${mo}-${d}T00:00:00`, tz);
    return {
      date: time ? zonedAt(tz, +y, +mo - 1, +d, time.hour, time.minute) : base,
      hadDate: true,
      hadTime: !!time,
    };
  }

  const short = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (short) {
    const [, d, mo, yRaw] = short;
    const y = yRaw.length === 2 ? 2000 + +yRaw : +yRaw;
    return {
      date: time
        ? zonedAt(tz, y, +mo - 1, +d, time.hour, time.minute)
        : zonedAt(tz, y, +mo - 1, +d),
      hadDate: true,
      hadTime: !!time,
    };
  }

  const zonedNow = toZonedTime(now, tz);
  const today = startOfDay(zonedNow);

  if (/\btoday\b/.test(text) || text.includes("aaj")) {
    const base = zonedAt(tz, today.getFullYear(), today.getMonth(), today.getDate());
    return {
      date: time ? new Date(base.getTime() + (time.hour * 3600 + time.minute * 60) * 1000) : base,
      hadDate: true,
      hadTime: !!time,
    };
  }
  if (/\byesterday\b/.test(text) || text.includes("kal") && !text.includes("next")) {
    const d = fnAddDays(zonedNow, -1);
    return {
      date: zonedAt(tz, d.getFullYear(), d.getMonth(), d.getDate()),
      hadDate: true,
      hadTime: false,
    };
  }
  if (/\btomorrow\b/.test(text) || /\bkal\b/.test(text)) {
    const d = fnAddDays(zonedNow, 1);
    return {
      date: time ? zonedAt(tz, d.getFullYear(), d.getMonth(), d.getDate(), time.hour, time.minute) : zonedAt(tz, d.getFullYear(), d.getMonth(), d.getDate()),
      hadDate: true,
      hadTime: !!time,
    };
  }

  const inDays = text.match(/in (\d+) days?/);
  if (inDays) {
    const d = fnAddDays(zonedNow, parseInt(inDays[1], 10));
    return {
      date: time
        ? zonedAt(tz, d.getFullYear(), d.getMonth(), d.getDate(), time.hour, time.minute)
        : zonedAt(tz, d.getFullYear(), d.getMonth(), d.getDate()),
      hadDate: true,
      hadTime: !!time,
    };
  }
  const inHours = text.match(/in (\d+) hours?/);
  if (inHours) {
    return {
      date: new Date(now.getTime() + parseInt(inHours[1], 10) * 3_600_000),
      hadDate: true,
      hadTime: true,
    };
  }

  const nextWeekday = text.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  const weekday = text.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  const wd = nextWeekday?.[1] ?? (text.includes("next") ? undefined : weekday?.[1]);
  if (wd) {
    const target = WEEKDAYS.indexOf(wd);
    let d = fnAddDays(zonedNow, (target - zonedNow.getDay() + 7) % 7 ||
      (nextWeekday ? 7 : 0));
    if (nextWeekday && d.getTime() === today.getTime()) d = fnAddDays(d, 7);
    if (!nextWeekday && !time && d.getDay() === zonedNow.getDay()) d = fnAddDays(d, 7);
    return {
      date: time ? zonedAt(tz, d.getFullYear(), d.getMonth(), d.getDate(), time.hour, time.minute) : zonedAt(tz, d.getFullYear(), d.getMonth(), d.getDate()),
      hadDate: true,
      hadTime: !!time,
    };
  }

  const datePhrase = text.match(/on?\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?\s+([a-z]+)/);
  if (datePhrase) {
    const day = parseInt(datePhrase[1], 10);
    const monthIdx = MONTH_NAMES.indexOf(datePhrase[2].slice(0, 3));
    if (monthIdx >= 0) {
      let y = zonedNow.getFullYear();
      const candidate = zonedAt(tz, y, monthIdx, day);
      if (candidate.getTime() < now.getTime() - 86_400_000) y += 1;
      return {
        date: time ? zonedAt(tz, y, monthIdx, day, time.hour, time.minute) : zonedAt(tz, y, monthIdx, day),
        hadDate: true,
        hadTime: !!time,
      };
    }
  }

  if (time) {
    const d = zonedNow;
    return {
      date: zonedAt(tz, d.getFullYear(), d.getMonth(), d.getDate(), time.hour, time.minute),
      hadDate: false,
      hadTime: true,
    };
  }

  return null;
}

export function clampTransferToEndOfMonth(d: Date): Date {
  return d;
}

export { fnAddDays, fnAddMonths, fnAddWeeks };