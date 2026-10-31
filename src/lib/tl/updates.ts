import type { Note } from "@/lib/tl/model";

const posted = new Date(2026, 9, 31, 7, 0).getTime();

const RETIRED_UPDATES = new Set(["update-2026-10-31", "update-2026-10-31-recent"]);

/** News cards shipped with the app. A stable id, so a journal gains each one once. */
export const UPDATE_NOTES: Note[] = [
  {
    id: "update-2026-10-31-all",
    type: "update",
    content: [
      "What changed.",
      "",
      "- Hold a card until it is selected, then drag across others to add them.",
      "- Tap a card to add it. Tap outside the cards to leave the selection.",
      "- Copy, tag, or trash what you selected.",
      "- The time, tags, and type sit under a faint line.",
      "- Explanations in the editor wait behind the info mark.",
      "- If the stored notes do not open, TLNotes says so and does not replace them.",
      "- The standing warning that notes might disappear is gone.",
      "- On the installed Android and iOS app, pictures and video are kept as files.",
      "- That app uses the same icon as the website, and it can bring in the phone calendar.",
      "- A local copy of the notes is kept as well.",
      "- Image and Video are no longer choices in the editor.",
      "- The picture or clip field, with attach and fetch, is gone from the editor.",
      "- A period line shows the note’s words, not the dates.",
      "- The editor grows with the screen, and the text field takes the room that is left.",
      "- This card is an Update. It is added when TLNotes changes, and it is not a type you can choose.",
    ].join("\n"),
    tags: [],
    created: posted,
    edited: posted,
    date: null,
  },
];

/** Drops retired update cards and adds any update the journal has not already kept or thrown away. */
export function withUpdates(notes: Note[], trash: Note[]): { notes: Note[]; trash: Note[] } {
  const nextNotes = notes.some((note) => RETIRED_UPDATES.has(note.id)) ? notes.filter((note) => !RETIRED_UPDATES.has(note.id)) : notes;
  const nextTrash = trash.some((note) => RETIRED_UPDATES.has(note.id)) ? trash.filter((note) => !RETIRED_UPDATES.has(note.id)) : trash;
  const owned = new Set([...nextNotes, ...nextTrash].map((note) => note.id));
  const extras = UPDATE_NOTES.filter((note) => !owned.has(note.id));
  const withNews = extras.length === 0 ? nextNotes : [...nextNotes, ...extras];
  if (withNews === notes && nextTrash === trash) return { notes, trash };
  return { notes: withNews, trash: nextTrash };
}
