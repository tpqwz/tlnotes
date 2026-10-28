import { mystRefs } from "@/lib/tl/myst";
import { isPageType, quotationFaces, type Note } from "@/lib/tl/model";
import { currentLanguage, languageMatches, languageName } from "@/lib/tl/language";

export function isWiki(note: Note) {
  return isPageType(note.type) || note.type === "quotation" || note.type === "link";
}

export function wikiTitle(note: Note) {
  return note.labels?.[0]?.text || note.content.split("\n")[0]?.trim() || "Untitled";
}

/** The name in the app language, when the page has one. Linking still uses every label. */
export function displayTitle(note: Note) {
  if (note.type === "quotation") return quotationFaces(note).primary;
  const wanted = currentLanguage();
  const label = (note.labels ?? []).find((item) => item.text.trim() && languageMatches(item.language, wanted));
  return label?.text || wikiTitle(note);
}

/** Short name for the header crumb. Quotations are clipped so the trail stays a trail. */
export function crumbTitle(note: Note) {
  const title = displayTitle(note).replace(/\s+/g, " ").trim();
  const limit = note.type === "quotation" ? 42 : 48;
  if (title.length <= limit) return title;
  return `${title.slice(0, limit - 1).trimEnd()}…`;
}

/** Other titles of the page. A label, in the Wikibase sense, is a title in a language. */
export function otherTitles(note: Note) {
  const title = displayTitle(note).trim().toLowerCase();
  const seen = new Set<string>([title]);
  const titles: { text: string; language: string }[] = [];
  for (const label of note.labels ?? []) {
    const text = label.text.trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    titles.push({ text, language: label.language ? languageName(label.language) : "" });
  }
  return titles;
}

export function wikiIndex(notes: Note[]) {
  const index = new Map<string, Note>();
  for (const note of notes) {
    if (!isWiki(note)) continue;
    const remember = (key: string) => {
      const name = key.trim().toLowerCase();
      if (name && !index.has(name)) index.set(name, note);
    };
    remember(note.id);
    remember(wikiTitle(note));
    for (const label of note.labels ?? []) remember(label.text);
  }
  return index;
}

export function wikiLinks(note: Note, index: Map<string, Note>) {
  const refs = isWiki(note) ? mystRefs(note.content) : [];
  const targets = [
    ...refs.map((ref) => ref.target),
    ...(note.statements ?? []).map((item) => item.value),
    ...(note.book?.authors ?? []),
    ...(note.book?.translators ?? []),
    ...(note.book?.subjects ?? []),
  ];
  const seen = new Set<string>();
  const links: Note[] = [];
  for (const target of targets) {
    const found = index.get(target.trim().toLowerCase());
    if (!found || found.id === note.id || seen.has(found.id)) continue;
    seen.add(found.id);
    links.push(found);
  }
  return links;
}

export function bibliography(note: Note, notes: Note[]) {
  const names = new Set(
    [wikiTitle(note), ...(note.labels ?? []).map((label) => label.text)].map((name) => name.trim().toLowerCase()).filter(Boolean),
  );
  const matches = (name: string) => names.has(name.trim().toLowerCase());
  const books = notes.filter((item) => item.type === "book" && (item.book?.authors ?? []).some(matches));
  const writings = notes.filter(
    (item) =>
      item.type === "quotation" &&
      ((item.sources ?? []).some((source) => matches(source.author)) ||
        (item.statements ?? []).some((statement) => statement.property.toLowerCase() === "author" && matches(statement.value))),
  );
  return { books, writings };
}

export function linkedFrom(note: Note, notes: Note[], index: Map<string, Note>) {
  return notes.filter((other) => other.id !== note.id && isWiki(other) && wikiLinks(other, index).some((item) => item.id === note.id));
}

export function pageNames(note: Note) {
  const raw = [wikiTitle(note), ...(note.labels ?? []).map((label) => label.text), note.book?.originalTitle ?? "", note.book?.subtitle ?? ""];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const name of raw) {
    const key = name.trim().toLowerCase();
    if (key.length < 2 || seen.has(key)) continue;
    seen.add(key);
    names.push(name.trim());
  }
  return names;
}

function sameName(value: string, name: string) {
  const left = value.trim().toLowerCase();
  const right = name.trim().toLowerCase();
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.split(/[,:;·–—-]/).some((part) => part.trim() === right)) return true;
  if (right.length >= 6 && left.includes(right)) return true;
  return false;
}

/** Quotations whose source, attachment, or link says they belong to this page. */
export function passages(note: Note, notes: Note[], index?: Map<string, Note>) {
  const names = pageNames(note);
  const cited = notes.filter((item) => {
    if (item.type !== "quotation" || item.id === note.id) return false;
    if (item.attachedTo === note.id) return true;
    const fields = [
      ...(item.sources ?? []).flatMap((source) => [source.work, source.container]),
      ...(item.statements ?? []).flatMap((statement) => {
        const property = statement.property.trim().toLowerCase();
        const named = /^(work|book|title|source|part of)$/.test(property) ? [statement.value] : [];
        return [...named, statement.source];
      }),
    ];
    return fields.some((value) => names.some((name) => sameName(value, name)));
  });
  const linked = index
    ? [...wikiLinks(note, index), ...linkedFrom(note, notes, index)].filter((item) => item.type === "quotation")
    : [];
  const seen = new Set<string>();
  const all: Note[] = [];
  for (const item of [...cited, ...linked]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    all.push(item);
  }
  return all;
}
