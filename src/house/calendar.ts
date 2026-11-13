/** A wall-clock date and time in the house timezone. Months run from 1 to 12. */
export interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export type LocalDate = Pick<LocalDateTime, "year" | "month" | "day">;

const fields = ["year", "month", "day", "hour", "minute"] as const;

/** Converts between instants and wall-clock times in the house timezone. */
export interface Calendar {
  toLocal(instant: Date): LocalDateTime;
  /** The instant a wall-clock time falls on, or undefined if the time does not exist there. */
  fromLocal(time: LocalDateTime): Date | undefined;
}

export function houseCalendar(timezone: string): Calendar {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });

  function toLocal(instant: Date): LocalDateTime {
    const parts = Object.fromEntries(
      format
        .formatToParts(instant)
        .map((part) => [part.type, Number(part.value)]),
    );
    return {
      year: parts["year"] ?? NaN,
      month: parts["month"] ?? NaN,
      day: parts["day"] ?? NaN,
      hour: parts["hour"] ?? NaN,
      minute: parts["minute"] ?? NaN,
    };
  }

  /** Milliseconds the house clock is ahead of UTC at `instant`, which must fall on a whole minute. */
  function offsetAt(instant: number): number {
    return utcMilliseconds(toLocal(new Date(instant))) - instant;
  }

  return {
    toLocal,

    fromLocal(time) {
      const wall = utcMilliseconds(time);
      // The offset at the guess can differ from the offset at the answer across a DST change,
      // so correct once with the offset at the first guess.
      const guess = wall - offsetAt(wall);
      const instant = wall - offsetAt(guess);
      // A time skipped by DST, or a date like February 30, reads back differently.
      const roundTrip = toLocal(new Date(instant));
      const exists = fields.every((field) => roundTrip[field] === time[field]);
      return exists ? new Date(instant) : undefined;
    },
  };
}

/** The wall-clock time read as if it were UTC. */
function utcMilliseconds(time: LocalDateTime): number {
  return Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute);
}

/** The calendar day before `date`. */
export function previousDay(date: LocalDate): LocalDate {
  const day = new Date(Date.UTC(date.year, date.month - 1, date.day - 1));
  return {
    year: day.getUTCFullYear(),
    month: day.getUTCMonth() + 1,
    day: day.getUTCDate(),
  };
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

/** Formats a date as YYYY-MM-DD. */
export function formatDate(date: LocalDate): string {
  return `${pad(date.year, 4)}-${pad(date.month)}-${pad(date.day)}`;
}

/** Formats a date and time as YYYY-MM-DD HH:MM. */
export function formatDateTime(time: LocalDateTime): string {
  return `${formatDate(time)} ${pad(time.hour)}:${pad(time.minute)}`;
}

/** Reads a date and time written as YYYY-MM-DD HH:MM, without checking it is a real time. */
export function parseDateTime(text: string): LocalDateTime | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(text.trim());
  if (!match) return undefined;
  // The pattern guarantees all five numbers, so the defaults are never used.
  const [year = 0, month = 0, day = 0, hour = 0, minute = 0] = match
    .slice(1)
    .map(Number);
  return { year, month, day, hour, minute };
}

/** A calendar month in the house timezone. */
export type Month = Pick<LocalDate, "year" | "month">;

/** The calendar month before `month`. */
export function previousMonth({ year, month }: Month): Month {
  return month === 1
    ? { year: year - 1, month: 12 }
    : { year, month: month - 1 };
}

/** Formats a month as YYYY-MM. */
export function formatMonth(month: Month): string {
  return `${pad(month.year, 4)}-${pad(month.month)}`;
}

const monthNames = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

/** Names a month as Housemates read it, such as "December 2026". */
export function nameMonth(month: Month): string {
  return monthNames.format(new Date(Date.UTC(month.year, month.month - 1, 1)));
}
