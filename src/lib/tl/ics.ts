import type { Note, PartialDate, SpanDate } from "@/lib/tl/model";
import { isSpan } from "@/lib/tl/model";
import { formatUiDate } from "@/lib/tl/language";

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

function dayIndex(date: { year: number; month: number; day: number }) {
  return Math.round(Date.UTC(date.year, date.month - 1, date.day) / 86_400_000);
}

type Civil = { year: number; month: number; day: number };
type Clock = { hour: number; minute: number };
type When = { date: Civil; time: Clock | null; zone: string };
type Raw = { value: string; params: string };

function parseWhen(value: string, params: string): When | null {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?/.exec(value.trim());
  if (!match) return null;
  let year = Number(match[1]);
  let month = Number(match[2]);
  let day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dated = /VALUE=DATE(?:;|$)/i.test(params) && match[4] == null;
  let time: Clock | null = !dated && match[4] != null ? { hour: Number(match[4]), minute: Number(match[5]) } : null;
  const zone = (/TZID=(?:"([^"]+)"|([^;:]+))/i.exec(params)?.[1] ?? /TZID=(?:"([^"]+)"|([^;:]+))/i.exec(params)?.[2] ?? "").trim();
  if (time && /Z$/i.test(value.trim())) {
    const moment = new Date(Date.UTC(year, month - 1, day, time.hour, time.minute, Number(match[6] ?? 0)));
    year = moment.getFullYear();
    month = moment.getMonth() + 1;
    day = moment.getDate();
    time = { hour: moment.getHours(), minute: moment.getMinutes() };
  }
  return { date: { year, month, day }, time, zone: time ? zone : "" };
}

function sameDay(a: Civil, b: Civil) {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function dayBefore(date: Civil): Civil {
  const last = new Date(Date.UTC(date.year, date.month - 1, date.day) - 86_400_000);
  return { year: last.getUTCFullYear(), month: last.getUTCMonth() + 1, day: last.getUTCDate() };
}

function writtenDay(date: Civil) {
  return formatUiDate(new Date(date.year, date.month - 1, date.day, 12), {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function writtenClock(time: Clock) {
  return `${pad(time.hour)}:${pad(time.minute)}`;
}

function zoneWord(zone: string) {
  const last = zone.split("/").pop()?.replaceAll("_", " ").trim() ?? "";
  return last;
}

function whenLines(start: When | null, end: When | null, due: boolean) {
  const when = start;
  if (!when) return [] as string[];
  const zone = zoneWord(when.zone);
  const suffix = zone ? `, ${zone}` : "";
  if (when.time && end?.time) {
    const range = `${writtenClock(when.time)}–${writtenClock(end.time)}${suffix}`;
    if (sameDay(when.date, end.date)) return [writtenDay(when.date), range];
    return [`${writtenDay(when.date)}, ${writtenClock(when.time)} – ${writtenDay(end.date)}, ${writtenClock(end.time)}${suffix}`];
  }
  if (when.time) return [due ? `Due ${writtenDay(when.date)}, ${writtenClock(when.time)}${suffix}` : writtenDay(when.date), ...(due ? [] : [`${writtenClock(when.time)}${suffix}`])];
  if (!due && end && !end.time) {
    const last = dayBefore(end.date);
    if (!sameDay(when.date, last) && dayIndex(last) > dayIndex(when.date)) return [`${writtenDay(when.date)} – ${writtenDay(last)}`];
  }
  return [due ? `Due ${writtenDay(when.date)}` : writtenDay(when.date)];
}

function repeatLine(rule: string) {
  const parts = Object.fromEntries(
    rule
      .split(";")
      .map((part) => part.split("="))
      .filter((pair) => pair[0])
      .map(([key, value]) => [key.toUpperCase(), value ?? ""]),
  );
  const unit: Record<string, [string, string]> = {
    DAILY: ["daily", "days"],
    WEEKLY: ["weekly", "weeks"],
    MONTHLY: ["monthly", "months"],
    YEARLY: ["yearly", "years"],
  };
  const name = unit[parts.FREQ?.toUpperCase() ?? ""];
  if (!name) return "";
  const interval = Number(parts.INTERVAL || "1");
  let line = interval > 1 && Number.isFinite(interval) ? `Repeats every ${interval} ${name[1]}` : `Repeats ${name[0]}`;
  if (parts.COUNT && /^\d+$/.test(parts.COUNT)) line += `, ${parts.COUNT} times`;
  else if (parts.UNTIL) {
    const until = parseWhen(parts.UNTIL, "");
    if (until) line += `, until ${writtenDay(until.date)}`;
  }
  return line;
}

function named(params: string, key: string) {
  const match = new RegExp(`${key}=(?:"([^"]*)"|([^;]+))`, "i").exec(params);
  return (match?.[1] ?? match?.[2] ?? "").trim();
}

function person(raw: Raw | undefined) {
  if (!raw) return "";
  const name = named(raw.params, "CN");
  const mail = raw.value.replace(/^mailto:/i, "").trim();
  return name || mail;
}

function eventBody(summary: string, groups: string[][]) {
  const title = summary.trim();
  const blocks: string[] = [];
  for (const group of groups) {
    const lines = group.map((item) => item.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const text = lines.join("\n");
    if (text === title || blocks.includes(text)) continue;
    if (/^https?:\/\//i.test(text) && blocks.some((block) => block.includes(text))) continue;
    blocks.push(text);
  }
  return blocks.length > 0 ? `${title}\n\n${blocks.join("\n\n")}` : title;
}

function blockToNote(kind: "VEVENT" | "VTODO", fields: Record<string, Raw>): Note | null {
  const summary = (fields.SUMMARY?.value ?? "").trim();
  if (!summary) return null;
  const start = fields.DTSTART ? parseWhen(fields.DTSTART.value, fields.DTSTART.params) : null;
  const end = fields.DTEND ? parseWhen(fields.DTEND.value, fields.DTEND.params) : null;
  const due = fields.DUE ? parseWhen(fields.DUE.value, fields.DUE.params) : null;
  const startDay = start?.date ?? null;
  const endDay = end?.date ?? null;
  const dueDay = due?.date ?? null;
  const tags = (fields.CATEGORIES?.value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const id = fields.UID?.value ? idFromUid(fields.UID.value.trim()) : crypto.randomUUID();
  const deadline = id.endsWith("-due");
  const noteId = deadline ? id.slice(0, -4) : id;
  const marker = (fields["X-TLNOTES-TYPE"]?.value ?? "").toLowerCase();
  const own = marker === "event" || marker === "task" || marker === "period";
  const now = Date.now();
  const task = kind === "VTODO" || deadline || marker === "task";
  const status = (fields.STATUS?.value ?? "").toUpperCase();
  const description = fields.DESCRIPTION?.value?.trim() ?? "";
  const location = fields.LOCATION?.value?.trim() ?? "";
  const link = (fields.URL?.value || fields["X-GOOGLE-CONFERENCE"]?.value || fields.CONFERENCE?.value || "").trim();
  const content = own
    ? summary
    : eventBody(summary, [
        [status === "CANCELLED" ? "Cancelled" : status === "TENTATIVE" ? "Tentative" : ""],
        whenLines(task ? (due ?? start) : start, task ? null : end, task),
        [fields.RRULE ? repeatLine(fields.RRULE.value) : ""],
        [location],
        [description && description !== "Ongoing" ? description : ""],
        [link],
        [person(fields.ORGANIZER)],
      ]);
  const base = {
    id: noteId,
    content,
    tags,
    created: now,
    edited: now,
  };

  if (task) {
    const when = dueDay ?? startDay;
    return {
      ...base,
      type: "task",
      date: when,
      done: status === "COMPLETED",
    };
  }

  if (marker === "period" || (startDay && endDay && dayIndex(endDay) - dayIndex(startDay) > 1)) {
    const last = endDay ? dayBefore(endDay) : null;
    return {
      ...base,
      type: "period",
      date: {
        begin: startDay,
        end: last,
      },
    };
  }

  return { ...base, type: "event", date: startDay };
}

export function parseIcs(text: string): Note[] | null {
  if (!/BEGIN:VCALENDAR/i.test(text)) return null;
  const unfolded = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "");
  const notes: Note[] = [];
  let kind: "VEVENT" | "VTODO" | null = null;
  let fields: Record<string, Raw> = {};

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
    const head = line.slice(0, split);
    const key = head.split(";")[0]?.toUpperCase();
    if (!key) continue;
    fields[key] = { value: unescapeText(line.slice(split + 1).trim()), params: head.slice(key.length) };
  }
  finish();
  return notes;
}
