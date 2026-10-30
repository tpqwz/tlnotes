import type { Note } from "@/lib/tl/model";

/** A leftover copy replaces the stored note only when it is strictly newer. */
export function laterNote(incoming: Note, stored: Note | undefined, removedAt?: number) {
  if (removedAt != null && removedAt > incoming.edited) return false;
  if (!stored) return true;
  if (incoming.edited !== stored.edited) return incoming.edited > stored.edited;
  return (incoming.trashedAt ?? 0) > (stored.trashedAt ?? 0);
}

export function mergeNotes(stored: Note[], incoming: Note[], removed: Record<string, number>) {
  const map = new Map(stored.map((note) => [note.id, note]));
  let changed = false;
  for (const note of incoming) {
    if (!laterNote(note, map.get(note.id), removed[note.id])) continue;
    map.set(note.id, note);
    changed = true;
  }
  return { notes: [...map.values()], changed };
}

export function unionRemoved(left: Record<string, number>, right: Record<string, number>) {
  const removed: Record<string, number> = { ...left };
  for (const [id, at] of Object.entries(right)) {
    if (removed[id] == null || at > removed[id]) removed[id] = at;
  }
  return removed;
}

/** Newer note wins. A deletion newer than the edit drops the note on both sides. */
export function combineJournals(local: Note[], remote: Note[], removed: Record<string, number>) {
  const merged = mergeNotes(local, remote, removed);
  const notes = merged.notes.filter((note) => {
    const at = removed[note.id];
    return at == null || note.edited >= at;
  });
  return { notes, changed: merged.changed || notes.length !== local.length };
}

/** A save may add and remove notes. It may not replace a stored journal with an unrelated one. */
export function journalWriteIsSafe(storedIds: string[], nextIds: string[], replace: boolean) {
  if (replace || storedIds.length === 0) return true;
  if (nextIds.length === 0) return false;
  const stored = new Set(storedIds);
  return nextIds.some((id) => stored.has(id));
}

export function canonicalNotes(notes: Note[], trash: Note[]) {
  const live = notes.map((note) => {
    if (note.trashedAt == null) return note;
    const copy = { ...note };
    delete copy.trashedAt;
    return copy;
  });
  const gone = trash.map((note) => (note.trashedAt ? note : { ...note, trashedAt: note.edited }));
  return [...live, ...gone];
}
  function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stable(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter((entry) => entry[1] !== undefined)
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function journalFingerprint(notes: Note[]) {
  return notes
    .map((note) => stable(note))
    .sort()
    .join("\n");
}
