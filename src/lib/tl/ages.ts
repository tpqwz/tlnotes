import { PERIOD_COLORS, type Note } from "@/lib/tl/model";
import { t } from "@/lib/tl/i18n";

export type Day = { year: number; month: number; day: number };

export type AgeSet = { id: string; name: string; birth: Day };

export type ListedAge = { id: string; name: string; birth: Day | null; count: number };

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

/** Period notes for those years. The wording is the app language at the moment they are made.
 *  An empty set id keeps the original `age-0` ids. Any other id is one life, and does not share those ids. */
export function ageNotes(birth: Day, now: number, ahead = 0, setId = ""): Note[] {
  const life = lifeYears(birth, now, ahead);
  if (!life.ok) return [];
  return life.years.map((year) => ({
    id: ageNoteId(setId, year.age),
    type: "period",
    content: t("Age {n}", { n: year.age }),
    tags: ["age"],
    created: now,
    edited: now,
    date: { begin: year.begin, end: year.end },
    color: PERIOD_COLORS[year.age % PERIOD_COLORS.length],
  }));
}

export function ageNoteId(setId: string, age: number) {
  return setId ? `age-${setId}-${age}` : `age-${age}`;
}

/** `age-12` is the original life. `age-k3f-12` is another. */
export function parseAgeId(id: string): { setId: string; age: number } | null {
  const named = /^age-([a-z0-9]+)-(\d+)$/.exec(id);
  if (named?.[1] && named[2]) return { setId: named[1], age: Number(named[2]) };
  const plain = /^age-(\d+)$/.exec(id);
  if (plain?.[1]) return { setId: "", age: Number(plain[1]) };
  return null;
}

export function isAgeNote(note: { id: string }) {
  return parseAgeId(note.id) != null;
}

export function newAgeSetId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function cleanAgeSets(value: unknown): AgeSet[] {
  if (!Array.isArray(value)) return [];
  const out: AgeSet[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as { id?: unknown; name?: unknown; birth?: unknown };
    const id = typeof raw.id === "string" && /^[a-z0-9]{0,24}$/.test(raw.id) ? raw.id : "";
    if (seen.has(id)) continue;
    const birth = raw.birth as Day | undefined;
    if (!birth || !isDay(birth)) continue;
    seen.add(id);
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 60) : "";
    out.push({ id, name, birth: { year: birth.year, month: birth.month, day: birth.day } });
  }
  return out;
}

/** Saved lives first, then any years still in the journal that settings does not name. */
export function listedAgeSets(notes: Note[], saved: AgeSet[]): ListedAge[] {
  const groups = new Map<string, Note[]>();
  for (const note of notes) {
    const parsed = parseAgeId(note.id);
    if (!parsed) continue;
    const list = groups.get(parsed.setId) ?? [];
    list.push(note);
    groups.set(parsed.setId, list);
  }
  const seen = new Set<string>();
  const rows: ListedAge[] = [];
  for (const set of saved) {
    seen.add(set.id);
    rows.push({ id: set.id, name: set.name, birth: set.birth, count: groups.get(set.id)?.length ?? 0 });
  }
  for (const [id, group] of groups) {
    if (seen.has(id)) continue;
    rows.push({ id, name: "", birth: birthFrom(group), count: group.length });
  }
  return rows;
}

export function replaceAgeSet(notes: Note[], trash: Note[], made: Note[], setId: string) {
  const keep = (note: Note) => parseAgeId(note.id)?.setId !== setId;
  return { notes: [...notes.filter(keep), ...made], trash: trash.filter(keep) };
}

function birthFrom(notes: Note[]): Day | null {
  let best: { age: number; begin: Day } | null = null;
  for (const note of notes) {
    const parsed = parseAgeId(note.id);
    const date = note.date;
    if (!parsed || !date || !("begin" in date) || !date.begin) continue;
    const { year, month, day } = date.begin;
    if (year == null || month == null || day == null) continue;
    if (!best || parsed.age < best.age) best = { age: parsed.age, begin: { year, month, day } };
  }
  if (!best) return null;
  return { year: best.begin.year - best.age, month: best.begin.month, day: best.begin.day };
}
