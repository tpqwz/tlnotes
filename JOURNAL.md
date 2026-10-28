# TLNotes — what to keep, and what to do next

A private timeline. Notes stay on the device. The repertorium was taken out on purpose and belongs in another app.

Read this before a large change. Update it when a feature lands, is dropped, or moves up the list. Then make a restore point.

## Do not lose

- Timeline: scope gutter, sticky year / month / day on one line with TLNotes, NOW rule sitting just above the composer, period rules that run the full width, a quiet glow when something is added.
- Types on the timeline: Note, Draft, Dream, Event, Period, Task, Link, Quote, Image, Video. Idea is gone. A picture with no words is an Image. A clip with no words is a Video. Each keeps the original file name, resolution, size, length when it is a clip, and the address when it was fetched. A video address pasted into the composer is read on add: the smallest video file, or a medium Opus track for music. When the site will not give up the file, the address, title, and picture are kept. One type showing in the filter means the composer adds that type.
- Cards: Quote is the short label and lines up with the others. A link's address, and its preview, are not live links. A long press or a double click opens Copy, Open, and, on a phone, Share. Long unbroken text wraps.
- Tasks: their own search and filter (tags, sort, done — no note types). Hold a card to move it. Dragging one onto another makes it a child. The grip is only a hint.
- Composer: paperclip inside the field. Pictures and clips are shrunk before they are kept.
- Look: a theme is the frame, and the desktop behind it has a pattern of its own. A color scheme is the palette. They are chosen apart. Motif is stippled, CDE is a paver, IRIX is a hatched indigo gradient. The set also includes journal, brutal, deco, admiralty, chapel, catalog, blueprint, terminal, broadsheet, pocket, dungeon, tavern, turbo, and Mac, plus the Turbo Vision and SCP palettes.
- Search: the timeline search is BM25, with Stem and Fuzzy on the search itself. Meaning uses the open view, including notes that do not contain the words. Turning Meaning on loads E5 when no model is chosen. The model is fetched once and kept in the browser.
- Settings: choices persist. Info sits behind an i, not as a paragraph under every control. Seal is optional. Updates are offered, not forced. Sync, and the choice of how a share is received, are shown only in the Android or iOS app, not in the browser or a PWA.
- The Android app lives in `android/` next to `package.json`. Run Capacitor from that parent folder. Do not run `cap add android`; it replaces the share and sync pieces.

## Out on purpose

- Repertorium, shelves, Bring in, and the wiki button.
- Graph query.
- Sync in a browser or an ordinary PWA.

## Next, in order

1. Keep a restore point after every large change. 0.4.0 beta is `artifacts/restore-points/tlnotes-0.4.0-beta.zip`.
2. Sharing into the installed Android app still has to show TLNotes on the share sheet. The choice to edit or add straight away is only in Settings on a Capacitor app, not in the browser or a PWA.
3. Check for updates must mean a real newer copy, not a fresh notice on every open.
4. On Android the composer should sit on the system bar, and the header should clear the camera hole.
5. Leave the timeline's layout alone unless something there is actually broken.

## Restore points

`node scripts/restore-point.mjs "what changed"` writes a zip under `artifacts/restore-points/`. It keeps the source and leaves out installed packages. Name the point after the change.

0.4.0 beta is the named copy of this tree: paste a picture into the composer, Android export opens the system save sheet, and the installer name and icon are TLNotes. The version on the package is `0.4.0-beta`. GitHub can build a debug Android package and an unsigned iOS compile. A phone install of iOS still needs Apple signing.
