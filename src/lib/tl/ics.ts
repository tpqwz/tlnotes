import type { Note, PartialDate, SpanDate } from "@/lib/tl/model";
import { isSpan } from "@/lib/tl/model";

const PRODID = "-//TLNotes//EN";
const HOST = "tlnotes.app";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function escapeText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function unescapeText(value: string) {
  return value.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function fold(line: string) {
  const encoder = new TextEncoder();
  let result = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) {
      result += "\r\n ";
      bytes = 1;
    }
    result += char;
    bytes += size;
  }
  return result;
}

function stamp(year: number, month: number, day: number) {
  return `${year}${pad(month)}${pad(day)}`;
}

function nextDay(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

function lastInclusive(date: PartialDate, through: Date) {
  const year = date.year ?? through.getFullYear();
  const month = date.month ?? (date.year ? 12 : through.getMonth() + 1);
  const day = date.day ?? new Date(year, month, 0).getDate();
  return { year, month, day };
}

function startOf(date: PartialDate | null, through: Date) {
  if (!date?.year && !date?.month && !date?.day) return null;
  const year = date?.year ?? through.getFullYear();
  const month = date?.month ?? 1;
  const day = date?.day ?? 1;
  return { year, month, day };
}

function uidFor(id: string) {
  return id.includes("@") ? id : `${id}@${HOST}`;
}

function idFromUid(uid: string) {
  const suffix = `@${HOST}`;
  return uid.endsWith(suffix) ? uid.slice(0, -suffix.length) : uid;
}

function dtstamp(time = Date.now()) {
  const date = new Date(time);
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function pointOf(note: Note): PartialDate | null {
  if (!note.date || isSpan(note.date)) return null;
  return note.date;
}

export function calendarNotes(notes: Note[]) {
  return notes.filter((note) => note.type === "event" || note.type === "task" || note.type === "period");
}

export function notesToIcs(notes: Note[], now = Date.now()) {
  const through = new Date(now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const note of calendarNotes(notes)) {
    const summary = escapeText(note.content.replace(/\s+/g, " ").trim());
    if (!summary) continue;
    const categories = note.tags.length > 0 ? escapeText(note.tags.join(",")) : "";
    const common = [
      `UID:${uidFor(note.id)}`,
      `DTSTAMP:${dtstamp(now)}`,
      `SUMMARY:${summary}`,
      `X-TLNOTES-TYPE:${note.type}`,
      ...(categories ? [`CATEGORIES:${categories}`] : []),
    ];

    if (note.type === "task") {
      const due = startOf(pointOf(note), through);
      lines.push("BEGIN:VTODO");
      lines.push(...common);
      if (due) lines.push(`DUE;VALUE=DATE:${stamp(due.year, due.month, due.day)}`);
      lines.push(`STATUS:${note.done ? "COMPLETED" : "NEEDS-ACTION"}`);
      if (note.done) lines.push(`COMPLETED:${dtstamp(note.edited || now)}`);
      lines.push("END:VTODO");
      if (!due) continue;
      const end = nextDay(due.year, due.month, due.day);
      lines.push("BEGIN:VEVENT");
      lines.push(...common.map((line) => (line.startsWith("UID:") ? `UID:${uidFor(`${note.id}-due`)}` : line.startsWith("X-TLNOTES-TYPE:") ? "X-TLNOTES-TYPE:task" : line)));
      lines.push(`DTSTART;VALUE=DATE:${stamp(due.year, due.month, due.day)}`);
      lines.push(`DTEND;VALUE=DATE:${stamp(end.year, end.month, end.day)}`);
      lines.push("END:VEVENT");
      continue;
    }

    if (note.type === "period") {
      const span = note.date && isSpan(note.date) ? note.date : ({ begin: null, end: null } satisfies SpanDate);
      const begin = startOf(span.begin, through);
      if (!begin) continue;
      const inclusive = span.end?.year || span.end?.month || span.end?.day ? lastInclusive(span.end ?? { year: null, month: null, day: null }, through) : lastInclusive({ year: through.getFullYear(), month: through.getMonth() + 1, day: through.getDate() }, through);
      const end = nextDay(inclusive.year, inclusive.month, inclusive.day);
      const beginNum = Date.UTC(begin.year, begin.month - 1, begin.day);
      const endNum = Date.UTC(end.year, end.month - 1, end.day);
      const safeEnd = endNum > beginNum ? end : nextDay(begin.year, begin.month, begin.day);
      lines.push("BEGIN:VEVENT");
      lines.push(...common);
      if (!span.end?.year && !span.end?.month && !span.end?.day) lines.push("DESCRIPTION:Ongoing");
      lines.push(`DTSTART;VALUE=DATE:${stamp(begin.year, begin.month, begin.day)}`);
      lines.push(`DTEND;VALUE=DATE:${stamp(safeEnd.year, safeEnd.month, safeEnd.day)}`);
      lines.push("END:VEVENT");
      continue;
    }

    const when = startOf(pointOf(note), through);
    if (!when) continue;
    const end = nextDay(when.year, when.month, when.day);
    lines.push("BEGIN:VEVENT");
    lines.push(...common);
    lines.push(`DTSTART;VALUE=DATE:${stamp(when.year, when.month, when.day)}`);
    lines.push(`DTEND;VALUE=DATE:${stamp(end.year, end.month, end.day)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

function parseDate(value: string) {
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function dayIndex(date: { year: number; month: number; day: number }) {
  return Math.round(Date.UTC(date.year, date.month - 1, date.day) / 86_400_000);
}

function blockToNote(kind: "VEVENT" | "VTODO", fields: Record<string, string>): Note | null {
  const content = (fields.SUMMARY ?? "").trim();
  if (!content) return null;
  const start = fields.DTSTART ? parseDate(fields.DTSTART) : null;
  const end = fields.DTEND ? parseDate(fields.DTEND) : null;
  const due = fields.DUE ? parseDate(fields.DUE) : null;
  const tags = (fields.CATEGORIES ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const id = fields.UID ? idFromUid(fields.UID.trim()) : crypto.randomUUID();
  const deadline = id.endsWith("-due");
  const noteId = deadline ? id.slice(0, -4) : id;
  const marker = (fields["X-TLNOTES-TYPE"] ?? "").toLowerCase();
  const now = Date.now();
  const base = {
    id: noteId,
    content,
    tags,
    created: now,
    edited: now,
  };

  if (kind === "VTODO" || deadline || marker === "task") {
    const when = due ?? start;
    return {
      ...base,
      type: "task",
      date: when,
      done: fields.STATUS?.toUpperCase() === "COMPLETED",
    };
  }

  if (marker === "period" || (start && end && dayIndex(end) - dayIndex(start) > 1)) {
    const last = end ? new Date(Date.UTC(end.year, end.month - 1, end.day) - 86_400_000) : null;
    return {
      ...base,
      type: "period",
      date: {
        begin: start,
        end: last ? { year: last.getUTCFullYear(), month: last.getUTCMonth() + 1, day: last.getUTCDate() } : null,
      },
    };
  }

  return { ...base, type: "event", date: start };
}

export function parseIcs(text: string): Note[] | null {
  if (!/BEGIN:VCALENDAR/i.test(text)) return null;
  const unfolded = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "");
  const notes: Note[] = [];
  let kind: "VEVENT" | "VTODO" | null = null;
  let fields: Record<string, string> = {};

  const finish = () => {
    if (!kind) return;
    const note = blockToNote(kind, fields);
    if (note) notes.push(note);
    kind = null;
    fields = {};
  };

  for (const line of unfolded.split("\n")) {
    if (/^BEGIN:VEVENT/i.test(line)) {
      finish();
      kind = "VEVENT";
      fields = {};
      continue;
    }
    if (/^BEGIN:VTODO/i.test(line)) {
      finish();
      kind = "VTODO";
      fields = {};
      continue;
    }
    if (/^END:(VEVENT|VTODO)/i.test(line)) {
      finish();
      continue;
    }
    if (!kind) continue;
    const split = line.indexOf(":");
    if (split === -1) continue;
    const key = line.slice(0, split).split(";")[0]?.toUpperCase();
    if (!key) continue;
    fields[key] = unescapeText(line.slice(split + 1).trim());
  }
  finish();
  return notes;
}
