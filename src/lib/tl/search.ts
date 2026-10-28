import type { Note } from "@/lib/tl/model";

const SUFFIXES = ["ingly", "edly", "ness", "ment", "tion", "ing", "ies", "ied", "ly", "ed", "es"];

function stemWord(word: string) {
  if (!/^[a-z]+$/.test(word) || word.length < 5) return word;
  for (const suffix of SUFFIXES) {
    if (!word.endsWith(suffix) || word.length - suffix.length < 3) continue;
    const root = word.slice(0, -suffix.length);
    if (suffix === "ies" || suffix === "ied") return `${root}y`;
    return root;
  }
  return word;
}

function isCjk(char: string) {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x3400 && code <= 0x9fff) ||
    (code >= 0x3040 && code <= 0x30ff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff)
  );
}

export function tokenize(text: string, stem: boolean) {
  const out: string[] = [];
  const chunks = text.toLowerCase().match(/\p{L}[\p{L}\p{M}'’]*|\p{N}+/gu) ?? [];
  for (const chunk of chunks) {
    if ([...chunk].every(isCjk)) {
      for (const char of chunk) out.push(char);
      continue;
    }
    out.push(stem ? stemWord(chunk) : chunk);
  }
  return out;
}

export function searchText(note: Note) {
  return [
    note.labels?.map((label) => label.text).join("\n") ?? "",
    note.description ?? "",
    note.content,
    note.tags.join(" "),
    note.book?.authors.join(" ") ?? "",
    note.book?.subjects.join(" ") ?? "",
    note.sources?.map((source) => `${source.author} ${source.work}`).join("\n") ?? "",
    note.statements?.map((item) => `${item.property} ${item.value}`).join("\n") ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

function distance(left: string, right: string, max: number) {
  if (Math.abs(left.length - right.length) > max) return max + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  let before = previous;
  for (let i = 1; i <= left.length; i += 1) {
    const next = [i];
    let best = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      let value = Math.min(next[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
        value = Math.min(value, before[j - 2] + 1);
      }
      next[j] = value;
      if (value < best) best = value;
    }
    if (best > max) return max + 1;
    before = previous;
    previous = next;
  }
  return previous[right.length];
}

export function rankNotes(notes: Note[], query: string, options: { stem: boolean; fuzzy: boolean }) {
  const phrase = query.trim().toLowerCase();
  if (!phrase) return notes;
  const terms = tokenize(phrase, options.stem);
  if (terms.length === 0) {
    return notes.filter((note) => searchText(note).toLowerCase().includes(phrase));
  }
  const docs = notes.map((note) => {
    const text = searchText(note);
    const tokens = tokenize(text, options.stem);
    const counts = new Map<string, number>();
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    return { note, text: text.toLowerCase(), tokens, counts, length: tokens.length || 1 };
  });
  const average = docs.reduce((sum, doc) => sum + doc.length, 0) / (docs.length || 1);
  const vocabulary = new Set<string>();
  const documentFrequency = new Map<string, number>();
  for (const doc of docs) {
    for (const term of doc.counts.keys()) {
      vocabulary.add(term);
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }
  const expanded = terms.map((term) => {
    if (!options.fuzzy || vocabulary.has(term) || term.length < 4) return [{ term, weight: 1 }];
    const max = term.length >= 7 ? 2 : 1;
    const near: { term: string; weight: number }[] = [];
    for (const known of vocabulary) {
      if (Math.abs(known.length - term.length) > max) continue;
      const gap = distance(term, known, max);
      if (gap > 0 && gap <= max) near.push({ term: known, weight: gap === 1 ? 0.65 : 0.4 });
    }
    near.sort((a, b) => b.weight - a.weight);
    return near.slice(0, 6);
  });
  const k1 = 1.2;
  const b = 0.75;
  const total = docs.length;
  const scored = docs.map((doc) => {
    let score = doc.text.includes(phrase) ? 1.5 : 0;
    expanded.forEach((group, index) => {
      for (const item of group) {
        const seen = doc.counts.get(item.term) ?? 0;
        if (!seen) continue;
        const docsWith = documentFrequency.get(item.term) ?? 0;
        const idf = Math.log(1 + (total - docsWith + 0.5) / (docsWith + 0.5));
        const denom = seen + k1 * (1 - b + b * (doc.length / average));
        score += item.weight * idf * ((seen * (k1 + 1)) / denom);
        if (index === 0 && doc.tokens.slice(0, 12).includes(item.term)) score += 0.15 * item.weight;
      }
    });
    return { note: doc.note, score };
  });
  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.note.edited - a.note.edited)
    .map((item) => item.note);
}

export function blendNotes(corpus: Note[], ranked: Note[], meaning: Map<string, number>) {
  if (meaning.size === 0) return ranked;
  const byId = new Map(corpus.map((note) => [note.id, note]));
  const weight = new Map(ranked.map((note, index) => [note.id, (ranked.length - index) / (ranked.length || 1)]));
  return [...new Set([...weight.keys(), ...meaning.keys()])]
    .flatMap((id) => {
      const note = byId.get(id);
      if (!note) return [];
      const near = Math.max(0, meaning.get(id) ?? 0);
      const score = 0.55 * (weight.get(id) ?? 0) + 0.45 * near;
      if (score <= 0.2 && !weight.has(id)) return [];
      return [{ note, score }];
    })
    .sort((a, b) => b.score - a.score)
    .map((item) => item.note);
}
