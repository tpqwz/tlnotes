import type { Note } from "@/lib/tl/model";

const posted = new Date(2026, 9, 31, 7, 0).getTime();
const since = new Date(2026, 10, 5, 3, 30).getTime();
const quieter = new Date(2026, 10, 7, 5, 30).getTime();

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
  {
    id: "update-2026-11-05",
    type: "update",
    content: [
      "What changed since.",
      "",
      "- The sheet is a little wider.",
      "- With the scope lines hidden, the cards sit clear of the vertical toolbar.",
      "- A light scroll no longer starts a selection. A firm hold still does.",
      "- On Android the composer sits closer to the navigation bar.",
      "- In the browser, and in the installed site, pictures stay off until you turn each one on. They share the space kept for the notes, and TLNotes says so before it keeps one. Turning both off removes the pictures kept in that copy.",
      "- A link preview keeps its picture only when pictures are on. A link added or edited in the editor is previewed when link previews are on.",
      "- Offside is a theme. Choosing it also chooses the Offside colours.",
      "- Each theme button is a sample of that theme, including its press.",
      "- A language the app speaks changes the buttons, the settings, and the dates, not only the quotation at the head. Many more are listed. Aramaic is Ārāmāʾīṯ, in Latin letters.",
      "- Anglish, English in the manner of Wycliffe and of the King James Bible, and Old English in the manner of Beowulf are listed. So are Irish Gaelic and Scottish Gaelic. Each changes the buttons and the dates.",
      "- Latin is more classical, with macrons. Its dates and counts are Roman numerals. Zero is written nulla.",
      "- A language that comes in only on a note is marked quotations. It leads that quotation. The buttons stay as they are.",
      "- Ages, in Settings, takes a birthday and lays one period for each year of life, through the year now under way. That year stays open. Running it again replaces those periods.",
      "- The sample timeline is laid out that way, from birth on past the present. The last of those years stays open.",
    ].join("\n"),
    tags: [],
    created: since,
    edited: since,
    date: null,
  },
  {
    id: "update-2026-11-07",
    type: "update",
    content: [
      "# What changed since",
      "",
      "A shorter journal, a fuller calendar card, and a quieter check for updates.",
      "",
      "## Calendar",
      "",
      "An imported event keeps the time, the date, and the rest in the card. That is the place, the notes, the link, who organized it, and a repeat, when the file has them.",
      "",
      "A calendar file this app wrote comes back as it left. Nothing is added on the way in.",
      "",
      "## The repertorium",
      "",
      "Pages, persons, books, and headwords are gone from this journal. That work continues at hyperbase.",
      "",
      "> An old note of one of those kinds stays stored and stays off the timeline. Restoring it says so. It is not turned into an ordinary note, and it is not deleted.",
      "",
      "## Checking and sharing",
      "",
      "A check is ready only when the published copy is **later** than this one. It says so once, then waits in Settings.",
      "",
      "Sharing text into the Android app shows **TLNotes** on the share sheet. The website copy gives that share a full address, so Android keeps it. An install from before that still needs the icon removed and TLNotes installed again.",
      "",
      "## Unchanged",
      "",
      "Quotations still keep the words, the original, a translator, and a source. The timeline was left where it was.",
    ].join("\n"),
    tags: [],
    created: quieter,
    edited: quieter,
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
