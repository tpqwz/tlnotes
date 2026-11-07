import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyLanguage } from "./language.ts";
import { notesToIcs, parseIcs } from "./ics.ts";
import type { Note } from "./model.ts";

applyLanguage("en");

describe("calendar import", () => {
  it("writes the time, the date, and the rest of a calendar event into the card", () => {
    const notes = parseIcs(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:dentist@example.com
SUMMARY:Dentist
DTSTART;TZID=America/Toronto:20260314T153000
DTEND;TZID=America/Toronto:20260314T160000
LOCATION:Clinic\\, 12 Main Street
DESCRIPTION:Bring the card.
URL:https://clinic.example/room
ORGANIZER;CN=Ada Lovelace:mailto:ada@example.com
RRULE:FREQ=WEEKLY
STATUS:TENTATIVE
END:VEVENT
END:VCALENDAR
`);
    assert.ok(notes);
    assert.equal(notes.length, 1);
    const note = notes[0];
    assert.equal(note.type, "event");
    assert.deepEqual(note.date, { year: 2026, month: 3, day: 14 });
    assert.match(note.content, /^Dentist\n\nTentative\n\n/);
    assert.match(note.content, /2026/);
    assert.match(note.content, /15:30–16:00, Toronto/);
    assert.match(note.content, /Repeats weekly/);
    assert.match(note.content, /Clinic, 12 Main Street/);
    assert.match(note.content, /Bring the card\./);
    assert.match(note.content, /https:\/\/clinic\.example\/room/);
    assert.match(note.content, /Ada Lovelace/);
  });

  it("writes an inclusive span for an all-day event of several days", () => {
    const notes = parseIcs(`BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Away
DTSTART;VALUE=DATE:20260314
DTEND;VALUE=DATE:20260318
END:VEVENT
END:VCALENDAR
`);
    assert.ok(notes);
    assert.equal(notes[0].type, "period");
    assert.match(notes[0].content, /Away\n\n/);
    assert.match(notes[0].content, /14/);
    assert.match(notes[0].content, /17/);
    assert.doesNotMatch(notes[0].content, /18/);
  });

  it("leaves a note exported from this app as it was", () => {
    const note: Note = {
      id: "note-1",
      type: "event",
      content: "Saw the dentist",
      tags: [],
      created: 1,
      edited: 1,
      date: { year: 2026, month: 3, day: 14 },
    };
    const back = parseIcs(notesToIcs([note], 1));
    assert.ok(back);
    assert.equal(back[0].content, "Saw the dentist");
    assert.deepEqual(back[0].date, { year: 2026, month: 3, day: 14 });
  });
});
