import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { combineJournals, journalFingerprint, laterNote, mergeNotes } from "./journal.ts";
import type { Note } from "@/lib/tl/model";

function note(id: string, edited: number, extra?: Partial<Note>): Note {
  return { id, type: "note", content: id, tags: [], created: edited, edited, date: null, ...extra };
}

describe("laterNote", () => {
  it("keeps a stored note that was edited later", () => {
    assert.equal(laterNote(note("a", 1), note("a", 2)), false);
  });

  it("takes a leftover note that was edited later", () => {
    assert.equal(laterNote(note("a", 3), note("a", 2)), true);
  });

  it("takes a trash mark when the edit time is unchanged", () => {
    assert.equal(laterNote(note("a", 2, { trashedAt: 9 }), note("a", 2)), true);
  });

  it("does not resurrect a note deleted after it was edited", () => {
    assert.equal(laterNote(note("a", 2), undefined, 5), false);
  });

  it("lets a newer edit return after a delete", () => {
    assert.equal(laterNote(note("a", 6), undefined, 5), true);
  });
});

describe("mergeNotes", () => {
  it("adds leftover notes without dropping ones the old copy never had", () => {
    const stored = [note("kept", 2), note("newer", 5, { content: "new" })];
    const incoming = [note("kept", 1), note("old-tab", 4), note("newer", 3, { content: "stale" })];
    const merged = mergeNotes(stored, incoming, {});
    const ids = merged.notes.map((item) => item.id).sort();
    assert.deepEqual(ids, ["kept", "newer", "old-tab"]);
    assert.equal(merged.notes.find((item) => item.id === "newer")?.content, "new");
    assert.equal(merged.changed, true);
  });

  it("leaves the fingerprint order-independent", () => {
    assert.equal(journalFingerprint([note("b", 1), note("a", 2)]), journalFingerprint([note("a", 2), note("b", 1)]));
  });

  it("drops a note deleted on the other side and keeps one edited after", () => {
    const local = [note("gone", 2), note("back", 8, { content: "later" })];
    const remote = [note("gone", 2), note("back", 4, { content: "earlier" }), note("only-there", 3)];
    const combined = combineJournals(local, remote, { gone: 5, back: 6 });
    const ids = combined.notes.map((item) => item.id).sort();
    assert.deepEqual(ids, ["back", "only-there"]);
    assert.equal(combined.notes.find((item) => item.id === "back")?.content, "later");
  });
});
