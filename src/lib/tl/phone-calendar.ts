import type { Note, PartialDate } from "@/lib/tl/model";
import { formatUiDate } from "@/lib/tl/language";
import { nativeSync } from "@/lib/tl/native-sync";

type PhoneEvent = {
  id?: string;
  title?: string;
  location?: string;
  notes?: string;
  startDate?: number;
  endDate?: number;
  isAllDay?: boolean;
  calendarName?: string;
};

const YEAR = 366 * 24 * 60 * 60 * 1000;

function dayIndex(date: PartialDate) {
  return Math.floor(Date.UTC(date.year ?? 0, (date.month ?? 1) - 1, date.day ?? 1) / 86_400_000);
}

function localDate(ms: number): PartialDate {
  const date = new Date(ms);
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

function phoneId(event: PhoneEvent) {
  const raw = `${event.id ?? ""}|${event.startDate ?? ""}|${event.title ?? ""}`;
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `phone-${(hash >>> 0).toString(36)}-${event.startDate ?? 0}`;
}

function clip(value: string | undefined, max: number) {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function clock(ms: number) {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function writtenDay(ms: number) {
  const date = new Date(ms);
  return formatUiDate(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12), {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function whenText(startMs: number, endMs: number, allDay: boolean, span: number) {
  if (allDay) {
    if (span > 1) return `${writtenDay(startMs)} – ${writtenDay(endMs - 86_400_000)}`;
    return writtenDay(startMs);
  }
  const start = localDate(startMs);
  const end = localDate(endMs);
  const same = start.year === end.year && start.month === end.month && start.day === end.day;
  if (!same) return `${writtenDay(startMs)}, ${clock(startMs)} – ${writtenDay(endMs)}, ${clock(endMs)}`;
  if (endMs !== startMs) return `${writtenDay(startMs)}\n${clock(startMs)}–${clock(endMs)}`;
  return `${writtenDay(startMs)}\n${clock(startMs)}`;
}

/** Events already on this phone, from one year ago through two years ahead. */
export async function readPhoneCalendar(): Promise<Note[]> {
  if (!nativeSync()) return [];
  const { Calendar } = await import("@capacitor/calendar");
  const now = Date.now();
  const result = await Calendar.findEvents({ startDate: now - YEAR, endDate: now + YEAR * 2 });
  return notesFromPhoneEvents(result.events ?? []);
}

export function notesFromPhoneEvents(events: PhoneEvent[], now = Date.now()): Note[] {
  const notes: Note[] = [];
  for (const event of events) {
    if (typeof event.startDate !== "number" || !Number.isFinite(event.startDate)) continue;
    const title = clip(event.title, 180) || "Calendar";
    const start = localDate(event.startDate);
    const endMs = typeof event.endDate === "number" && Number.isFinite(event.endDate) ? event.endDate : event.startDate;
    const end = localDate(endMs);
    const span = dayIndex(end) - dayIndex(start);
    const detail = [whenText(event.startDate, endMs, event.isAllDay === true, span), clip(event.location, 180), clip(event.notes, 400)]
      .filter(Boolean)
      .join("\n\n");
    const tag = clip(event.calendarName, 40);
    const base = {
      id: phoneId(event),
      content: `${title}\n\n${detail}`,
      tags: tag ? [tag] : [],
      created: now,
      edited: now,
    };
    if (span > 1) {
      const last = new Date(end.year ?? 0, (end.month ?? 1) - 1, end.day ?? 1);
      last.setDate(last.getDate() - 1);
      notes.push({
        ...base,
        type: "period",
        date: {
          begin: start,
          end: { year: last.getFullYear(), month: last.getMonth() + 1, day: last.getDate() },
        },
      });
      continue;
    }
    notes.push({ ...base, type: "event", date: start });
  }
  return notes;
}
