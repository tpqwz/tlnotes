import { PERIOD_COLORS, type Note } from "@/lib/tl/model";
import { t } from "@/lib/tl/i18n";

export type Day = { year: number; month: number; day: number };

export type LifeYear = { age: number; begin: Day; end: Day | null };

export type LifeYears =
  | { ok: true; years: LifeYear[] }
  | { ok: false; reason: "invalid" | "ahead" | "long" };

const LIFE_LIMIT = 150;

function stamp(day: Day) {
  return day.year * 10000 + day.month * 100 + day.day;
}

function isDay(day: Day) {
  if (!Number.isInteger(day.year) || day.year < 1 || day.year > 9999) return false;
  if (!Number.isInteger(day.month) || day.month < 1 || day.month > 12) return false;
  if (!Number.isInteger(day.day) || day.day < 1 || day.day > 31) return false;
  const probe = new Date(day.year, day.month - 1, day.day);
  return probe.getFullYear() === day.year && probe.getMonth() === day.month - 1 && probe.getDate() === day.day;
}

function todayOf(now: number): Day {
  const date = new Date(now);
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

/** The same month and day, n years on. A missing day, such as 29 February, falls back to the last day of that month. */
function anniversary(birth: Day, years: number): Day {
  const year = birth.year + years;
  const probe = new Date(year, birth.month - 1, birth.day);
  if (probe.getMonth() === birth.month - 1) return { year: probe.getFullYear(), month: probe.getMonth() + 1, day: probe.getDate() };
  const last = new Date(year, birth.month, 0);
  return { year: last.getFullYear(), month: last.getMonth() + 1, day: last.getDate() };
}

function dayBefore(day: Day): Day {
  const date = new Date(day.year, day.month - 1, day.day);
  date.setDate(date.getDate() - 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

/** One closed year of life for each completed age, and an open period for the age now under way.
 *  `ahead` keeps laying years past that one. The last of them stays open, so the line runs on. */
export function lifeYears(birth: Day, now: number, ahead = 0): LifeYears {
  if (!isDay(birth)) return { ok: false, reason: "invalid" };
  const today = todayOf(now);
  if (stamp(birth) > stamp(today)) return { ok: false, reason: "ahead" };
  if (stamp(anniversary(birth, LIFE_LIMIT)) <= stamp(today)) return { ok: false, reason: "long" };
  const extra = Number.isInteger(ahead) && ahead > 0 ? Math.min(ahead, LIFE_LIMIT) : 0;
  const years: LifeYear[] = [];
  let current = -1;
  for (let age = 0; age <= LIFE_LIMIT; age++) {
    const begin = anniversary(birth, age);
    if (stamp(begin) > stamp(today)) break;
    const next = anniversary(birth, age + 1);
    const open = stamp(next) > stamp(today);
    years.push({ age, begin, end: open && extra === 0 ? null : dayBefore(next) });
    if (open) {
      current = age;
      break;
    }
  }
  if (extra > 0 && current >= 0) {
    for (let step = 1; step <= extra; step++) {
      const age = current + step;
      if (age > LIFE_LIMIT) break;
      const begin = anniversary(birth, age);
      const next = anniversary(birth, age + 1);
      const last = step === extra || age === LIFE_LIMIT;
      years.push({ age, begin, end: last ? null : dayBefore(next) });
      if (last) break;
    }
  }
  return { ok: true, years };
}

export function isAgeNote(note: { id: string }) {
  return note.id.startsWith("age-");
}

/** Period notes for those years. The wording is the app language at the moment they are made. */
export function ageNotes(birth: Day, now: number, ahead = 0): Note[] {
  const life = lifeYears(birth, now, ahead);
  if (!life.ok) return [];
  return life.years.map((year) => ({
    id: `age-${year.age}`,
    type: "period",
    content: t("Age {n}", { n: year.age }),
    tags: ["age"],
    created: now,
    edited: now,
    date: { begin: year.begin, end: year.end },
    color: PERIOD_COLORS[year.age % PERIOD_COLORS.length],
  }));
}
