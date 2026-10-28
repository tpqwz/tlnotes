import { type EntityLabel, type Note, type Statement } from "@/lib/tl/model";
import { currentLanguage, languageName } from "@/lib/tl/language";

const AGENT = "TLNotes/1.0 (personal timeline; local import)";

const FACTS: Record<string, string> = {
  P31: "instance of",
  P279: "subclass of",
  P361: "part of",
  P527: "has part",
  P17: "country",
  P131: "located in",
  P276: "location",
  P19: "place of birth",
  P20: "place of death",
  P569: "date of birth",
  P570: "date of death",
  P106: "occupation",
  P27: "country of citizenship",
  P21: "sex or gender",
  P136: "genre",
  P50: "author",
  P170: "creator",
  P577: "publication date",
  P580: "start time",
  P582: "end time",
  P856: "official website",
  P1476: "title",
  P571: "inception",
  P37: "official language",
  P1082: "population",
  P2046: "area",
};

const PLACES = new Set(["city", "town", "village", "country", "capital", "continent", "geographic region"]);
const WORKS = new Set(["book", "literary work", "film", "painting", "musical work", "song"]);

type Sense = { partOfSpeech?: string; language?: string; definitions?: { definition?: string }[] };

function plain(html: string) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/&#39;|'/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function getJson(url: string, timeoutMs = 20000) {
  let host = url;
  try {
    host = new URL(url).hostname;
  } catch {
    host = url;
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (/wik[it]|mediawiki|wikimedia/.test(host)) headers["Api-User-Agent"] = AGENT;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, { headers, signal: controller.signal });
    if (response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      response = await fetch(url, { headers, signal: controller.signal });
    }
  } catch {
    throw new Error(controller.signal.aborted ? `${host} did not answer.` : `Could not reach ${host}.`);
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 429) throw new Error(`${host} is busy. Try again in a moment.`);
  if (!response.ok) throw new Error(`Could not read ${host}.`);
  return response.json() as Promise<unknown>;
}

function page(partial: Partial<Note> & { content: string; labels: EntityLabel[] }): Note {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    type: "page",
    tags: [],
    created: now,
    edited: now,
    date: null,
    ...partial,
  };
}

function statement(property: string, value: string, source: string, sourceUrl: string): Statement {
  return { id: crypto.randomUUID(), property, value, qualifiers: [], source, sourceUrl };
}

const SPEECH: Record<string, string> = {
  n: "noun",
  v: "verb",
  adj: "adjective",
  adv: "adverb",
  u: "other",
};

function speechName(code: string) {
  const key = code.trim().toLowerCase();
  return SPEECH[key] ?? (key || "sense");
}

function senseOf(raw: string) {
  const tab = raw.indexOf("\t");
  const speech = tab >= 0 ? raw.slice(0, tab).trim() : "";
  let gloss = plain(tab >= 0 ? raw.slice(tab + 1) : raw);
  const notes: string[] = [];
  const lead = /^\(([^)]+)\)\s*/.exec(gloss);
  if (lead) {
    notes.push(...lead[1].split(",").map((item) => item.trim()).filter(Boolean));
    gloss = gloss.slice(lead[0].length).trim();
  }
  return { speech: speechName(speech), gloss, notes };
}

function absLink(href: string) {
  const cleaned = href.replace(/&/g, "&").replace(/^https?:\/\/web\.archive\.org\/web\/[^/]+\//, "");
  try {
    return new URL(cleaned, "https://www.onelook.com/").href;
  } catch {
    return cleaned;
  }
}

function htmlText(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/&#39;|'/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type IndexRow = { forms: { text: string; href: string }[]; dictionary: string; offline: boolean };
type IndexGroup = { category: string; count: string; rows: IndexRow[] };

function oneLookIndex(html: string) {
  const start = html.search(/id=['"]section-dicts['"]/i);
  if (start < 0 || !/matching dictionaries/i.test(html)) return null;
  const end = html.search(/id=['"]section-defn['"]/i);
  const block = html.slice(start, end > start ? end : undefined);
  const found = /We found (\d+) dictionaries/i.exec(block);
  const marks: { category: string; count: string; at: number }[] = [];
  const heading = /<u><b>([^<]+)<\/b><\/u>\s*\(([^)]*)\)/gi;
  let match: RegExpExecArray | null;
  while ((match = heading.exec(block))) marks.push({ category: htmlText(match[1]), count: htmlText(match[2]), at: match.index });
  const groups: IndexGroup[] = marks.map((mark, index) => {
    const slice = block.slice(mark.at, marks[index + 1]?.at ?? block.length);
    const rows: IndexRow[] = [];
    const item = /<li>([\s\S]*?)(?=<li>|<\/ol|$)/gi;
    let row: RegExpExecArray | null;
    while ((row = item.exec(slice))) {
      const body = row[1];
      const offline = /no longer online/i.test(body);
      const forms: { text: string; href: string }[] = [];
      const anchor = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let link: RegExpExecArray | null;
      while ((link = anchor.exec(body))) forms.push({ href: absLink(link[1]), text: htmlText(link[2]) });
      const text = htmlText(body.replace(/<i>\s*\([^)]*no longer online[^)]*\)\s*<\/i>/gi, ""));
      const colon = text.lastIndexOf(":");
      const dictionary = (offline || colon < 0 ? text : text.slice(colon + 1)).replace(/\(no longer online\)/i, "").trim();
      const formText = colon >= 0 ? text.slice(0, colon) : "";
      const kept = forms.filter((form) => form.text && formText.includes(form.text));
      if (dictionary) rows.push({ forms: kept, dictionary, offline });
    }
    return { category: mark.category, count: mark.count, rows };
  }).filter((group) => group.rows.length > 0);
  if (groups.length === 0) return null;
  const also = /See\s*<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(block);
  return { total: found?.[1] ?? String(groups.reduce((sum, group) => sum + group.rows.length, 0)), groups, also: also ? { href: absLink(also[1]), text: htmlText(also[2]) } : null };
}

async function fetchOneLookIndex(word: string) {
  try {
    const response = await fetch(`https://www.onelook.com/?w=${encodeURIComponent(word)}`, { headers: { Accept: "text/html" } });
    if (!response.ok) return null;
    return oneLookIndex(await response.text());
  } catch {
    return null;
  }
}

export async function importOneLook(word: string): Promise<Note> {
  const term = word.trim();
  if (!term) throw new Error("Write a word first.");
  const [data, index] = await Promise.all([
    getJson(`https://api.datamuse.com/words?sp=${encodeURIComponent(term)}&md=dprf&max=8&qe=sp`).catch(() => []) as Promise<{ word?: string; tags?: string[]; defs?: string[] }[]>,
    fetchOneLookIndex(term),
  ]);
  const hit = data.find((item) => item.word?.toLowerCase() === term.toLowerCase() && item.defs?.length) ?? data.find((item) => item.defs?.length);
  if (!hit?.defs?.length && !index) throw new Error(`OneLook has no entry for “${term}”.`);
  const name = hit?.word || term;
  const wikiUrl = `https://en.wiktionary.org/wiki/${encodeURIComponent(name)}`;
  const oneLookUrl = `https://www.onelook.com/?w=${encodeURIComponent(name)}`;
  const statements: Statement[] = [];
  const lines = [`# ${name}`, ""];
  if (index) {
    lines.push(`OneLook found ${index.total} dictionaries.`, "");
    for (const group of index.groups) {
      lines.push(`## ${group.category}`, "", group.count, "");
      group.rows.forEach((row, number) => {
        const forms = row.forms.map((form) => `[${form.text}](${form.href})`).join(", ");
        const offline = row.offline ? " *(no longer online)*" : "";
        lines.push(forms ? `${number + 1}. ${forms}: ${row.dictionary}${offline}` : `${number + 1}. ${row.dictionary}${offline}`, "");
        const sourceUrl = row.forms[0]?.href || oneLookUrl;
        const entry = statement(group.category, row.dictionary, row.forms.map((form) => form.text).join(", "), sourceUrl);
        if (row.offline) entry.qualifiers = [{ property: "status", value: "no longer online" }];
        statements.push(entry);
      });
    }
    if (index.also) lines.push(`See [${index.also.text}](${index.also.href}) as well.`, "");
  }
  const senses = (hit?.defs ?? []).map(senseOf).filter((item) => item.gloss);
  const groups: { speech: string; senses: { gloss: string; notes: string[] }[] }[] = [];
  for (const sense of senses) {
    let group = groups.find((item) => item.speech === sense.speech);
    if (!group) {
      group = { speech: sense.speech, senses: [] };
      groups.push(group);
    }
    if (group.senses.length < 4) group.senses.push({ gloss: sense.gloss, notes: sense.notes });
  }
  const pronunciation = (hit?.tags ?? []).find((tag) => tag.startsWith("pron:"));
  if (pronunciation) statements.push(statement("pronunciation", pronunciation.slice(5).trim().replace(/\s+/g, " · "), "Datamuse", oneLookUrl));
  if (groups.length > 0) {
    lines.push("## Wiktionary", "");
    for (const group of groups.slice(0, 4)) {
      lines.push(`### ${group.speech.charAt(0).toUpperCase()}${group.speech.slice(1)}`, "");
      group.senses.forEach((sense, number) => {
        const label = sense.notes.join(", ");
        lines.push(label ? `${number + 1}. **${label}.** ${sense.gloss}` : `${number + 1}. ${sense.gloss}`, "");
        const row = statement(group.speech, sense.gloss, "Wiktionary", wikiUrl);
        if (label) row.qualifiers = [{ property: "sense", value: label }];
        statements.push(row);
      });
    }
  }
  const [synonyms, antonyms] = await Promise.all([related(name, "rel_syn"), related(name, "rel_ant")]);
  for (const word of synonyms) statements.push(statement("synonym", word, "WordNet", "https://wordnet.princeton.edu/"));
  for (const word of antonyms) statements.push(statement("antonym", word, "WordNet", "https://wordnet.princeton.edu/"));
  lines.push(`[OneLook](${oneLookUrl})${groups.length > 0 ? ` · [Wiktionary](${wikiUrl})` : ""}`);
  return page({
    type: "headword",
    content: lines.join("\n").trim(),
    labels: [{ text: name, language: "en" }],
    description: groups[0]?.senses[0]?.gloss || (index ? `${index.total} dictionaries` : ""),
    statements: statements.slice(0, 80),
    url: oneLookUrl,
  });
}

async function related(word: string, relation: "rel_syn" | "rel_ant") {
  try {
    const data = (await getJson(`https://api.datamuse.com/words?${relation}=${encodeURIComponent(word)}&max=5`)) as { word?: string }[];
    return data.map((item) => item.word?.trim() ?? "").filter(Boolean);
  } catch {
    return [];
  }
}

async function wiktionarySenses(code: string, title: string) {
  try {
    const data = (await getJson(`https://${code}.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(title)}`)) as Record<string, Sense[]>;
    return Object.values(data).flat().filter((sense) => sense.definitions?.length);
  } catch {
    return [];
  }
}

export async function importWord(word: string): Promise<Note> {
  const term = word.trim();
  if (!term) throw new Error("Write a word first.");
  const title = term.replace(/\s+/g, "_");
  const preferred = /^[a-z]{2,3}$/.test(currentLanguage()) ? currentLanguage() : "en";
  const hosts = [...new Set([preferred, "en", "la"])];
  const found = (
    await Promise.all(hosts.map(async (code) => ({ code, senses: await wiktionarySenses(code, title) })))
  ).filter((item) => item.senses.length > 0);
  const lead = found.find((item) => item.code === preferred) ?? found[0];
  if (!lead) throw new Error(`Wiktionary has no entry for “${term}”.`);
  const lines: string[] = [`# ${term}`, ""];
  const statements: Statement[] = [];
  const source = "Wiktionary";
  const sourceUrl = `https://${lead.code}.wiktionary.org/wiki/${encodeURIComponent(title)}`;
  for (const sense of lead.senses.slice(0, 3)) {
    const speech = sense.partOfSpeech?.trim();
    if (speech) {
      lines.push(`## ${speech}`, "");
      statements.push(statement("part of speech", speech, source, sourceUrl));
    }
    for (const definition of (sense.definitions ?? []).slice(0, 3)) {
      const text = plain(definition.definition ?? "");
      if (!text) continue;
      lines.push(text, "");
      statements.push(statement("definition", text, source, sourceUrl));
    }
  }
  for (const item of found) {
    if (item.code === lead.code) continue;
    const gloss = plain(item.senses[0]?.definitions?.[0]?.definition ?? "");
    if (!gloss) continue;
    statements.push(statement(languageName(item.code), gloss, source, `https://${item.code}.wiktionary.org/wiki/${encodeURIComponent(title)}`));
    lines.push(`**${languageName(item.code)}.** ${gloss}`, "");
  }
  lines.push(`[${source}](${sourceUrl})`);
  return page({
    type: "headword",
    content: lines.join("\n").trim(),
    labels: found.map((item) => ({ text: term, language: item.code })),
    description: plain(lead.senses[0]?.definitions?.[0]?.definition ?? ""),
    statements: statements.slice(0, 12),
    url: sourceUrl,
  });
}

function snakText(snak: { datavalue?: { type?: string; value?: unknown } } | undefined) {
  const data = snak?.datavalue;
  if (!data) return "";
  if (data.type === "wikibase-entityid") {
    const id = (data.value as { id?: string })?.id ?? "";
    return id;
  }
  if (data.type === "time") {
    const time = String((data.value as { time?: string })?.time ?? "");
    return time.replace(/^\+/, "").slice(0, 10);
  }
  if (data.type === "quantity") return String((data.value as { amount?: string })?.amount ?? "").replace(/^\+/, "");
  if (data.type === "string") return String(data.value ?? "");
  if (data.type === "monolingualtext") return String((data.value as { text?: string })?.text ?? "");
  if (typeof data.value === "string") return data.value;
  return "";
}

function designationFor(values: string[]) {
  const names = values.map((value) => value.toLowerCase());
  if (names.some((name) => name === "human" || name === "person")) return "person";
  if (names.some((name) => PLACES.has(name))) return "place";
  if (names.some((name) => WORKS.has(name))) return "work";
  if (names.some((name) => name.includes("proverb"))) return "proverb";
  return "concept";
}

const WIKI_HOSTS = ["wikipedia.org", "wiktionary.org", "wikisource.org", "wikiquote.org", "wikibooks.org", "wikiversity.org", "wikivoyage.org", "wikinews.org", "wikimedia.org", "mediawiki.org", "wikidata.org"];

export function wikiTarget(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  if (!WIKI_HOSTS.some((item) => host === item || host.endsWith(`.${item}`))) return null;
  if (host === "wikidata.org" && /^Q\d+$/i.test(parts[1] ?? "") && parts[0] === "wiki") {
    return { host, title: (parts[1] ?? "").toUpperCase(), kind: "wikidata" as const };
  }
  if (parts[0] !== "wiki" || !parts[1]) return null;
  let title = "";
  try {
    title = decodeURIComponent(parts.slice(1).join("/"));
  } catch {
    title = parts.slice(1).join("/");
  }
  if (/^(Special|File|Category|Talk|User|Template|Help|Wikipedia|Portal|Draft|Module):/i.test(title)) return null;
  if (host.endsWith("wiktionary.org")) return { host, title, kind: "wiktionary" as const };
  return { host, title, kind: "wiki" as const };
}

export function importableAddress(value: string) {
  return wikiTarget(value) != null;
}

export function sameAddress(left: string, right: string) {
  const a = wikiTarget(left);
  const b = wikiTarget(right);
  if (a && b) return a.host === b.host && a.title.replace(/_/g, " ").toLowerCase() === b.title.replace(/_/g, " ").toLowerCase();
  return left.replace(/\/$/, "") === right.replace(/\/$/, "");
}

function reduced(text: string) {
  const clean = text.trim();
  if (clean.length <= 900) return clean;
  const cut = clean.slice(0, 900);
  const stop = cut.lastIndexOf(". ");
  return `${(stop > 400 ? cut.slice(0, stop + 1) : cut).trimEnd()}…`;
}

const LABEL_CODES = ["en", "la", "de", "fr", "es", "it", "pt", "nl", "pl", "ru", "uk", "el", "he", "ar", "fa", "hi", "sa", "zh", "ja", "ko", "sv", "cs", "da", "fi", "hu", "ro", "tr", "vi", "id", "ca", "grc", "pi", "bn", "ta", "eo"];

function labelLanguages() {
  const extra = currentLanguage();
  const codes = new Set(LABEL_CODES);
  if (/^[a-z]{2,3}$/.test(extra)) codes.add(extra);
  return [...codes].join("|");
}

/** Prefer a modest thumbnail. A full file is not what a page should keep. */
export function smallImage(url: string) {
  if (!url) return "";
  let next = url.replace(/\/\d+px-/, "/160px-");
  try {
    const parsed = new URL(next);
    if (parsed.searchParams.has("width") || (parsed.hostname.includes("wikimedia.org") && parsed.pathname.includes("Special:FilePath"))) {
      parsed.searchParams.set("width", "160");
      next = parsed.href;
    }
  } catch {
    return next;
  }
  return next;
}

async function keepImage(url: string) {
  const small = smallImage(url);
  const modest = await fetchImage(small);
  if (modest) return modest;
  if (small !== url) {
    const wider = await fetchImage(url);
    if (wider) return wider;
  }
  return small;
}

async function fetchImage(url: string) {
  try {
    const response = await fetch(url, { headers: { Accept: "image/*" } });
    if (!response.ok) return "";
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return "";
    if (blob.size > 80_000) return url;
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("image"));
      reader.readAsDataURL(blob);
    });
    return data.startsWith("data:image/") && data.length < 120_000 ? data : url;
  } catch {
    return "";
  }
}

type WikiEntity = {
  labels?: Record<string, { value?: string; language?: string }>;
  descriptions?: Record<string, { value?: string; language?: string }>;
  aliases?: Record<string, { value?: string; language?: string }[]>;
  claims?: Record<string, { mainsnak?: { datavalue?: { type?: string; value?: unknown } } }[]>;
  sitelinks?: Record<string, { title?: string; site?: string }>;
  missing?: string;
};

type EntityRecord = {
  id: string;
  label: string;
  labels: EntityLabel[];
  description: string;
  statements: Statement[];
  image: string;
  type: string;
  designation: string;
  book?: Note["book"];
  articles: Record<string, string>;
};

function rememberLabel(labels: EntityLabel[], text: string | undefined, language: string | undefined) {
  const value = text?.trim();
  if (!value) return;
  const code = language?.trim() || "";
  if (labels.some((item) => item.text === value && item.language === code)) return;
  labels.push({ text: value, language: code });
}

function orderedCodes(present: string[]) {
  const preferred = currentLanguage();
  const first = [preferred, "en", "la"].filter((code, index, all) => code && all.indexOf(code) === index);
  return [...first, ...present.filter((code) => !first.includes(code))];
}

function collectLabels(entity: WikiEntity, fallback: string) {
  const labels: EntityLabel[] = [];
  const codes = orderedCodes(Object.keys(entity.labels ?? {}));
  for (const code of codes) {
    rememberLabel(labels, entity.labels?.[code]?.value, code);
    for (const alias of (entity.aliases?.[code] ?? []).slice(0, 4)) rememberLabel(labels, alias.value, alias.language || code);
  }
  for (const [site, link] of Object.entries(entity.sitelinks ?? {})) {
    const code = site.endsWith("wiki") ? site.slice(0, -4) : "";
    if (!/^[a-z]{2,3}$/.test(code)) continue;
    if (labels.some((item) => item.language === code)) continue;
    rememberLabel(labels, link.title?.replace(/_/g, " "), code);
  }
  if (labels.length === 0) rememberLabel(labels, fallback, "en");
  return labels.slice(0, 36);
}

function preferredDescription(entity: WikiEntity) {
  const descriptions = entity.descriptions ?? {};
  for (const code of orderedCodes(Object.keys(descriptions))) {
    const text = descriptions[code]?.value?.trim();
    if (text) return text;
  }
  return "";
}

function articlesOf(entity: WikiEntity) {
  const articles: Record<string, string> = {};
  for (const [site, link] of Object.entries(entity.sitelinks ?? {})) {
    const code = site.endsWith("wiki") ? site.slice(0, -4) : "";
    const title = link.title?.trim();
    if (/^[a-z]{2,3}$/.test(code) && title) articles[code] = title;
  }
  return articles;
}

async function fetchEntity(id: string, props: string) {
  const languages = labelLanguages();
  try {
    return (await getJson(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(id)}&props=${props}&languages=${languages}&format=json&origin=*`,
    )) as { entities?: Record<string, WikiEntity> };
  } catch {
    return (await getJson(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(id)}&props=${props}&languages=en|la&format=json&origin=*`,
    )) as { entities?: Record<string, WikiEntity> };
  }
}

async function readWikidata(id: string, fallback: string): Promise<EntityRecord> {
  const entityData = await fetchEntity(id, "labels|descriptions|aliases|claims|sitelinks");
  const entity = entityData.entities?.[id];
  if (!entity || entity.missing) throw new Error("That entity did not come back.");
  const labels = collectLabels(entity, fallback);
  const preferred = labels.find((item) => item.language === currentLanguage()) ?? labels.find((item) => item.language === "en") ?? labels[0];
  const label = preferred?.text || fallback;
  const claims = entity.claims ?? {};
  const file = snakText(claims.P18?.[0]?.mainsnak).replace(/ /g, "_");
  const wanted = Object.keys(FACTS);
  const chosen = wanted.filter((pid) => claims[pid]?.length).slice(0, 12);
  const itemIds = new Set<string>();
  for (const pid of chosen) {
    for (const claim of (claims[pid] ?? []).slice(0, 3)) {
      const text = snakText(claim.mainsnak);
      if (/^Q\d+$/.test(text)) itemIds.add(text);
    }
  }
  const names = new Map<string, string>();
  if (itemIds.size > 0) {
    const nameLangs = [currentLanguage(), "en"].filter((code, index, all) => /^[a-z]{2,3}$/.test(code) && all.indexOf(code) === index).join("|");
    const resolved = (await getJson(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${[...itemIds].join("|")}&props=labels&languages=${nameLangs}&format=json&origin=*`,
    )) as { entities?: Record<string, WikiEntity> };
    for (const [qid, item] of Object.entries(resolved.entities ?? {})) {
      const name = item.labels?.[currentLanguage()]?.value || item.labels?.en?.value;
      if (name) names.set(qid, name);
    }
  }
  const sourceUrl = `https://www.wikidata.org/wiki/${id}`;
  const statements: Statement[] = [];
  for (const pid of chosen) {
    for (const claim of (claims[pid] ?? []).slice(0, 2)) {
      const raw = snakText(claim.mainsnak);
      const value = names.get(raw) || raw;
      if (!value || /^Q\d+$/.test(value)) continue;
      statements.push(statement(FACTS[pid] ?? pid, value, "Wikidata", sourceUrl));
    }
  }
  const instance = statements.filter((item) => item.property === "instance of").map((item) => item.value);
  const designation = designationFor(instance);
  const type = instance.some((value) => value.toLowerCase() === "human")
    ? "persona"
    : instance.some((value) => WORKS.has(value.toLowerCase()))
      ? "book"
      : "page";
  const authors = statements.filter((item) => item.property === "author" || item.property === "creator").map((item) => item.value);
  const book = type === "book"
    ? {
        subtitle: "",
        authors,
        translators: [],
        language: statements.find((item) => item.property === "official language")?.value ?? "",
        originalTitle: statements.find((item) => item.property === "title")?.value ?? "",
        originalLanguage: "",
        form: "treatise",
        publisher: "",
        place: "",
        published: statements.find((item) => item.property === "publication date")?.value ?? "",
        edition: "",
        isbn: "",
        subjects: [],
      }
    : undefined;
  return {
    id,
    label,
    labels,
    description: preferredDescription(entity),
    statements: statements.slice(0, 16),
    image: file ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=160` : "",
    type,
    designation,
    book,
    articles: articlesOf(entity),
  };
}

export async function importEntity(query: string, kind: "encyclopedia" | "wikidata"): Promise<Note> {
  const term = query.trim();
  if (!term) throw new Error("Write a name first.");
  let id = /^Q\d+$/i.test(term) ? term.toUpperCase() : "";
  if (!id) {
    const preferred = /^[a-z]{2,3}$/.test(currentLanguage()) ? currentLanguage() : "en";
    const search = async (language: string) => {
      const found = (await getJson(
        `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(term)}&language=${language}&format=json&origin=*&limit=1&type=item`,
      )) as { search?: { id?: string }[] };
      return found.search?.[0]?.id ?? "";
    };
    id = await search(preferred);
    if (!id && preferred !== "en") id = await search("en");
  }
  if (!id) throw new Error(`Wikidata has no entity for “${term}”.`);
  const record = await readWikidata(id, term);
  let extract = "";
  let article = "";
  let image = record.image;
  if (kind === "encyclopedia") {
    const preferred = currentLanguage();
    const attempts: { host: string; title: string }[] = [];
    if (/^[a-z]{2,3}$/.test(preferred) && record.articles[preferred]) attempts.push({ host: `${preferred}.wikipedia.org`, title: record.articles[preferred] });
    if (record.articles.en || record.label) attempts.push({ host: "en.wikipedia.org", title: record.articles.en || record.label });
    for (const attempt of attempts) {
      try {
        const summary = (await getJson(`https://${attempt.host}/api/rest_v1/page/summary/${encodeURIComponent(attempt.title.replace(/\s+/g, "_"))}`)) as {
          extract?: string;
          description?: string;
          thumbnail?: { source?: string };
          content_urls?: { desktop?: { page?: string } };
        };
        if (!summary.extract && !summary.thumbnail) continue;
        extract = reduced(summary.extract ?? "");
        article = summary.content_urls?.desktop?.page ?? `https://${attempt.host}/wiki/${encodeURIComponent(attempt.title.replace(/\s+/g, "_"))}`;
        if (summary.thumbnail?.source) image = summary.thumbnail.source;
        if (!record.description && summary.description) record.description = summary.description;
        if (extract) break;
      } catch {
        continue;
      }
    }
  }
  const sourceUrl = `https://www.wikidata.org/wiki/${record.id}`;
  const body = [`# ${record.label}`, "", record.description, "", extract, "", article ? `[Original](${article})` : "", `[Wikidata](${sourceUrl})`]
    .filter((line, index, all) => line !== "" || all[index - 1] !== "")
    .join("\n")
    .trim();
  return page({
    type: record.type,
    content: body,
    labels: record.labels,
    description: record.description,
    designation: record.designation,
    statements: record.statements,
    book: record.book,
    url: article || sourceUrl,
    image: image ? await keepImage(image) : undefined,
  });
}

const SPHERES = {
  encyclosearch: { host: "encyclosearch.org", name: "EncycloSearch", wait: 15000 },
  oldpedia: { host: "oldpedia.org", name: "Oldpedia", wait: 40000 },
} as const;

const PUBLISHER_NAME: Record<string, string> = {
  sep: "Stanford Encyclopedia of Philosophy",
  iep: "Internet Encyclopedia of Philosophy",
  britannica11: "Encyclopædia Britannica (1911)",
  nwe: "New World Encyclopedia",
  citizendium: "Citizendium",
  conservapedia: "Conservapedia",
  wikipedia: "Wikipedia",
  handwiki: "HandWiki",
  jewishenc: "Jewish Encyclopedia",
  isbe: "International Standard Bible Encyclopedia",
  rationalwiki: "RationalWiki",
  wikiversity: "Wikiversity",
  foldoc: "Free On-line Dictionary of Computing",
};

type SphereHit = { SourceURL?: string; Description?: string; Title?: string; Publisher?: string };

function publisherName(id: string) {
  const known = PUBLISHER_NAME[id];
  if (known) return known;
  const words = id.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Encyclopedia";
}

function sphereRank(hit: SphereHit, term: string) {
  const title = (hit.Title ?? "").trim().toLowerCase();
  const query = term.trim().toLowerCase();
  let rank = 0;
  if (title === query) rank -= 80;
  else if (title.startsWith(query)) rank -= 30;
  else if (title.includes(query)) rank -= 8;
  if ((hit.Description ?? "").trim().length > 40) rank -= 12;
  const preferred = ["sep", "iep", "britannica11", "nwe", "jewishenc", "isbe", "citizendium", "wikipedia"];
  const place = preferred.indexOf(hit.Publisher ?? "");
  if (place >= 0) rank -= 16 - place;
  return rank;
}

export async function importSphere(query: string, which: keyof typeof SPHERES): Promise<Note> {
  const term = query.trim();
  const sphere = SPHERES[which];
  if (!term) throw new Error("Write a name first.");
  const data = (await getJson(`https://${sphere.host}/encyclosphere/search?q=${encodeURIComponent(term)}`, sphere.wait)) as { Results?: SphereHit[] };
  const hits = (data.Results ?? []).filter((item) => item.Title?.trim() && item.SourceURL && item.Publisher !== "sandbox");
  if (hits.length === 0) throw new Error(`${sphere.name} has nothing for “${term}”.`);
  const ranked = [...hits].sort((a, b) => sphereRank(a, term) - sphereRank(b, term) || (a.Title ?? "").localeCompare(b.Title ?? ""));
  const best = ranked[0];
  const title = best.Title!.trim();
  const lead = reduced(plain(best.Description ?? ""));
  const publisher = publisherName(best.Publisher ?? "");
  const lines = [`# ${title}`, ""];
  if (lead) lines.push(lead, "", `— ${publisher}`, "");
  const also = ranked.slice(1, 8);
  const statements: Statement[] = [statement("publisher", publisher, sphere.name, best.SourceURL ?? "")];
  if (also.length > 0) {
    lines.push(`## Also in ${sphere.name}`, "");
    also.forEach((item, index) => {
      const name = item.Title!.trim();
      const from = publisherName(item.Publisher ?? "");
      const href = item.SourceURL ?? "";
      lines.push(`${index + 1}. [${name}](${href}) — ${from}`, "");
      statements.push(statement("also", `${name} — ${from}`, sphere.name, href));
    });
  }
  lines.push(`[${sphere.name}](https://${sphere.host}/?q=${encodeURIComponent(term)})`);
  return page({
    type: "page",
    content: lines.join("\n").trim(),
    labels: [{ text: title, language: "en" }],
    description: lead,
    statements: statements.slice(0, 12),
    url: best.SourceURL,
  });
}

async function importMediaWiki(host: string, title: string): Promise<Note> {
  const summary = (await getJson(`https://${host}/api/rest_v1/page/summary/${encodeURIComponent(title)}`)) as {
    title?: string;
    extract?: string;
    description?: string;
    thumbnail?: { source?: string };
    wikibase_item?: string;
    content_urls?: { desktop?: { page?: string } };
  };
  const name = summary.title || title.replace(/_/g, " ");
  const original = summary.content_urls?.desktop?.page || `https://${host}/wiki/${encodeURIComponent(title)}`;
  let record: EntityRecord | null = null;
  if (summary.wikibase_item) {
    try {
      record = await readWikidata(summary.wikibase_item, name);
    } catch {
      record = null;
    }
  }
  const lead = reduced(summary.extract || record?.description || "");
  if (!lead && !record) throw new Error("That page had nothing to keep.");
  const image = summary.thumbnail?.source || record?.image || "";
  const description = summary.description || record?.description || "";
  const body = [`# ${name}`, "", description, "", lead, "", `[Original](${original})`].filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n").trim();
  return page({
    type: record?.type ?? "page",
    content: body,
    labels: record?.labels?.length ? record.labels : [{ text: name, language: "" }],
    description,
    designation: record?.designation,
    statements: record?.statements,
    book: record?.book,
    url: original,
    image: image ? await keepImage(image) : undefined,
  });
}

export async function importAddress(value: string): Promise<Note> {
  const target = wikiTarget(value);
  if (!target) throw new Error("That address is not a wiki page this app can reduce.");
  if (target.kind === "wikidata") return importEntity(target.title, "wikidata");
  if (target.kind === "wiktionary") {
    const note = await importWord(target.title.replace(/_/g, " "));
    note.url = `https://${target.host}/wiki/${encodeURIComponent(target.title)}`;
    return note;
  }
  return importMediaWiki(target.host, target.title);
}
