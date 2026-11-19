import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ageNotes, cleanAgeSets, listedAgeSets, lifeYears, replaceAgeSet } from "./ages.ts";
import { applyLanguage } from "./language.ts";
import { sampleNotes } from "./sample.ts";

const born = { year: 1973, month: 10, day: 1 };
const now = new Date(2026, 10, 5).getTime();

describe("life years", () => {
  it("lays a period on every year from a birthday, and leaves the present year open", () => {
    const life = lifeYears(born, now);
    assert.equal(life.ok, true);
    if (!life.ok) return;
    assert.equal(life.years.length, 54);
    assert.deepEqual(life.years[0], {
      age: 0,
      begin: { year: 1973, month: 10, day: 1 },
      end: { year: 1974, month: 9, day: 30 },
    });
    assert.deepEqual(life.years[1].begin, { year: 1974, month: 10, day: 1 });
    assert.deepEqual(life.years[52], {
      age: 52,
      begin: { year: 2025, month: 10, day: 1 },
      end: { year: 2026, month: 9, day: 30 },
    });
    assert.deepEqual(life.years[53], {
      age: 53,
      begin: { year: 2026, month: 10, day: 1 },
      end: null,
    });
  });

  it("keeps 29 February and falls back when the year has no such day", () => {
    const life = lifeYears({ year: 2000, month: 2, day: 29 }, new Date(2004, 2, 1).getTime());
    assert.equal(life.ok, true);
    if (!life.ok) return;
    assert.deepEqual(life.years[0].end, { year: 2001, month: 2, day: 27 });
    assert.deepEqual(life.years[1].begin, { year: 2001, month: 2, day: 28 });
    assert.deepEqual(life.years[4].begin, { year: 2004, month: 2, day: 29 });
    assert.equal(life.years[4].end, null);
  });

  it("refuses a day that is not a day, a birthday still ahead, and a span past 150 years", () => {
    assert.deepEqual(lifeYears({ year: 1973, month: 2, day: 31 }, now), { ok: false, reason: "invalid" });
    assert.deepEqual(lifeYears({ year: 2026, month: 11, day: 6 }, now), { ok: false, reason: "ahead" });
    assert.equal(lifeYears({ year: 2026, month: 11, day: 5 }, now).ok, true);
    assert.deepEqual(lifeYears({ year: 1800, month: 1, day: 1 }, now), { ok: false, reason: "long" });
  });

  it("names the periods in the app language", () => {
    applyLanguage("la");
    const notes = ageNotes(born, now);
    assert.equal(notes[0]?.content, "Aetās nulla");
    assert.equal(notes[12]?.content, "Aetās XII");
    assert.equal(notes[12]?.type, "period");
    assert.equal(notes[12]?.id, "age-12");
    applyLanguage("en");
    assert.equal(ageNotes(born, now)[12]?.content, "Age 12");
    applyLanguage("system");
  });

  it("can keep laying years past the one now under way", () => {
    const life = lifeYears(born, now, 12);
    assert.equal(life.ok, true);
    if (!life.ok) return;
    assert.equal(life.years.at(-1)?.age, 53 + 12);
    assert.equal(life.years.at(-1)?.end, null);
    assert.deepEqual(life.years[53]?.end, { year: 2027, month: 9, day: 30 });
    assert.ok((life.years.at(-1)?.begin.year ?? 0) > 2026);
  });
});

describe("sample life", () => {
  it("wears the birthday periods from birth through years past the present", () => {
    applyLanguage("en");
    const notes = sampleNotes(now).filter((note) => note.id.startsWith("age-"));
    assert.equal(notes[0]?.content, "Age 0");
    assert.equal(notes[0]?.type, "period");
    assert.equal(notes[0]?.tags[0], "age");
    assert.deepEqual(notes[0]?.date, {
      begin: { year: 1998, month: 6, day: 12 },
      end: { year: 1999, month: 6, day: 11 },
    });
    const open = notes.find((note) => note.date != null && "end" in note.date && note.date.end == null);
    if (!open || !open.date || !("begin" in open.date)) {
      assert.fail("the last age should stay open");
      return;
    }
    const beginYear = open.date.begin?.year ?? 0;
    assert.equal(beginYear, 1998 + (notes.length - 1));
    assert.ok(beginYear > 2026);
    const later = notes.filter((note) => note.date && "begin" in note.date && (note.date.begin?.year ?? 0) > 2026);
    assert.ok(later.length > 1);
    assert.ok(later.some((note) => note.date && "end" in note.date && note.date.end != null));
    applyLanguage("system");
  });
});

describe("several lives", () => {
  it("keeps a second life off the original ids, and removes only that life", () => {
    const original = ageNotes(born, now);
    const other = ageNotes({ year: 2010, month: 4, day: 2 }, now, 0, "anna");
    assert.equal(original[0]?.id, "age-0");
    assert.equal(other[0]?.id, "age-anna-0");
    const replaced = replaceAgeSet([...original, ...other], [], ageNotes({ year: 2011, month: 1, day: 9 }, now, 0, "anna"), "anna");
    assert.equal(replaced.notes.filter((note) => note.id.startsWith("age-anna-")).length > 0, true);
    assert.equal(replaced.notes.some((note) => note.id === "age-0"), true);
    assert.equal(replaced.notes.some((note) => note.id === "age-anna-0" && note.date && "begin" in note.date && note.date.begin?.year === 2011), true);
    const gone = replaceAgeSet(replaced.notes, [{ ...other[0]!, id: "age-anna-0" }], [], "anna");
    assert.equal(gone.notes.some((note) => note.id.startsWith("age-anna-")), false);
    assert.equal(gone.trash.some((note) => note.id.startsWith("age-anna-")), false);
    assert.equal(gone.notes.some((note) => note.id === "age-0"), true);
  });

  it("lists a life that was laid before names, and a saved one beside it", () => {
    const original = ageNotes(born, now);
    const saved = cleanAgeSets([{ id: "anna", name: "Anna", birth: { year: 2010, month: 4, day: 2 } }, { id: "anna", name: "Again", birth: { year: 2010, month: 4, day: 2 } }, { id: "bad", name: "No", birth: { year: 2010, month: 2, day: 31 } }]);
    assert.equal(saved.length, 1);
    assert.equal(saved[0]?.name, "Anna");
    const listed = listedAgeSets(original, saved);
    assert.equal(listed.length, 2);
    assert.equal(listed[0]?.id, "anna");
    assert.equal(listed[1]?.id, "");
    assert.equal(listed[1]?.count, original.length);
    assert.deepEqual(listed[1]?.birth, born);
  });
});
