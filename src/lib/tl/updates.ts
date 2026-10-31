import type { Note } from "@/lib/tl/model";

const posted = new Date(2026, 9, 31, 12).getTime();

/** News cards shipped with the app. A stable id, so a journal gains each one once. */
export const UPDATE_NOTES: Note[] = [
  {
    id: "update-2026-10-31",
    type: "update",
    content:
      "Hold a card until it is selected, then drag across others to add them. Tap a card to add it. Tap outside the cards to leave. Copy, tag, or trash what you selected.\n\nThe time, tags, and type sit under a faint line. Explanations in the editor wait behind the info mark.\n\nThis card is an Update. One is added when TLNotes changes. It is not a type you can choose.",
    tags: [],
    created: posted,
    edited: posted,
    date: { year: 2026, month: 10, day: 31 },
  },
];

/** Adds any update the journal has not already kept or thrown away. */
export function withUpdates(notes: Note[], trash: Note[]): Note[] {
  const owned = new Set([...notes, ...trash].map((note) => note.id));
  const extras = UPDATE_NOTES.filter((note) => !owned.has(note.id));
  return extras.length === 0 ? notes : [...notes, ...extras];
}
