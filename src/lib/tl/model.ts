// @ts-nocheck
import { languageMatches, currentLanguage, formatUiDate } from "@/lib/tl/language";
import { t } from "@/lib/tl/i18n";

export type PartialDate = { year: number | null; month: number | null; day: number | null };
export type SpanDate = { begin: PartialDate | null; end: PartialDate | null };
export type NoteDate = PartialDate | SpanDate;
export type QuotationSource = {
  id: string;
  author: string;
  work: string;
  container: string;
  edition: string;
  locator: string;
  published: string;
  url: string;
};
export type QuotationLanguage = { id: string; language: string; text: string; translator?: string };
export type EntityLabel = { text: string; language: string };
export type Statement = {
  id: string;
  property: string;
  value: string;
  qualifiers: { property: string; value: string }[];
  source: string;
  sourceUrl: string;
};
export type Book = {
  subtitle: string;
  authors: string[];
  translators: string[];
  language: string;
  originalTitle: string;
  originalLanguage: string;
  form: string;
  publisher: string;
  place: string;
  published: string;
  edition: string;
  isbn: string;
  subjects: string[];
};
export type LinkPreview = { site: string; line: string; kept?: boolean; image?: string; bare?: boolean };
export type Note = {
  id: string;
  type: string;
  content: string;
  tags: string[];
  created: number;
  edited: number;
  date: NoteDate | null;
  color?: string;
  trashedAt?: number;
  done?: boolean;
  url?: string;
  preview?: LinkPreview;
  image?: string;
  video?: string;
  imageFacts?: MediaFacts;
  videoFacts?: MediaFacts;
  attachedTo?: string;
  parentId?: string;
  rank?: number;
  sources?: QuotationSource[];
  originalLanguage?: string;
  languages?: QuotationLanguage[];
  labels?: EntityLabel[];
  description?: string;
  designation?: string;
  statements?: Statement[];
  book?: Book;
};

export type MediaFacts = {
  name?: string;
  width?: number;
  height?: number;
  bytes?: number;
  seconds?: number;
  url?: string;
};
export type Filters = { types: string[]; tags: string[]; search: string };
export type TimelineRow =
  | { kind: "year"; key: string; label: string }
  | { kind: "month"; key: string; label: string }
  | { kind: "day"; key: string; label: string; day: number }
  | { kind: "now"; key: string }
  | { kind: "note"; key: string; note: Note }
  | { kind: "periodEnd"; key: string; note: Note };

export const BOOK_FORMS = [
	"treatise",
	"dialogue",
	"poem",
	"scripture",
	"essay",
	"fragments",
	"letters",
	"handbook",
	"chronicle"
] as const;
export const DESIGNATIONS = [
	"word",
	"name",
	"person",
	"place",
	"work",
	"concept",
	"maxim",
	"axiom",
	"adage",
	"proverb",
	"aphorism"
] as const;
const DESIGNATION_ECHO = {
	persona: [
		"person",
		"name",
		"persona"
	],
	book: ["work", "book"],
	headword: ["word", "headword"],
	page: ["page"],
	quotation: [
		"quotation",
		"saying",
		"quote"
	],
	link: ["link"],
	event: ["event"]
};
/** A finer kind, such as maxim or place. Timeline types and the shelf's own name are not kinds. */
export function kindOf(note) {
	const value = note.designation?.trim().toLowerCase() ?? "";
	if (!value) return "";
	if (TIMELINE_TYPES.includes(value)) return "";
	if ((DESIGNATION_ECHO[note.type] ?? []).includes(value)) return "";
	return value;
}
export const CORE_TYPES = [
	"note",
	"dream",
	"draft",
	"event",
	"period",
	"task",
	"link",
	"quotation",
	"image",
	"video",
	"page",
	"headword",
	"persona",
	"book"
] as const;
export const PAGE_TYPES = [
	"page",
	"headword",
	"persona",
	"book"
] as const;
export const TIMELINE_TYPES = CORE_TYPES.filter((type) => !PAGE_TYPES.includes(type));
const LEGACY_TYPES = ["dict"];
export const ALL_TYPES = [...CORE_TYPES, ...LEGACY_TYPES];
const TYPE_LABEL = {
	draft: "Draft",
	note: "Note",
	event: "Event",
	period: "Period",
	task: "Task",
	link: "Link",
	quotation: "Quote",
	image: "Image",
	video: "Video",
	page: "Page",
	headword: "Headword",
	persona: "Persona",
	book: "Book",
	dream: "Dream",
	update: "Update",
	dict: "Dict"
};
const typePriority = {
	period: 0,
	event: 1,
	task: 2,
	dream: 3,
	dict: 4,
	draft: 5,
	image: 6,
	video: 7,
	quotation: 8,
	link: 9,
	page: 10,
	headword: 11,
	persona: 12,
	book: 13,
	note: 14,
	update: -1
};
export function isPageType(type) {
	return PAGE_TYPES.includes(type);
}
export const PERIOD_COLORS = [
	"#1f6b4a",
	"#a35b32",
	"#2c5f7c",
	"#8a6232",
	"#6b4c7a"
] as const;
export const DEFAULT_PERIOD_COLOR = PERIOD_COLORS[0];
export function typeLabel(type: string) {
	const label = TYPE_LABEL[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
	return t(label);
}
export function isSpan(date: NoteDate | null | undefined): date is SpanDate {
	return !!date && ("begin" in date || "end" in date);
}
export function safeColor(color, fallback = DEFAULT_PERIOD_COLOR) {
	return typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}
export function getPartialDateTime(dateObj, fallbackTime) {
	if (!dateObj) return fallbackTime;
	const fallbackDate = new Date(fallbackTime);
	const y = dateObj.year ?? fallbackDate.getFullYear();
	const m = dateObj.month ? dateObj.month - 1 : 0;
	const d = dateObj.day || 1;
	return new Date(y, m, d).getTime();
}
function placedPartial(note) {
	if (note.type === "draft" || !note.date) return null;
	if (note.type === "period") return isSpan(note.date) ? note.date.begin : null;
	if (note.type === "event") return isSpan(note.date) ? null : note.date;
	if (!isSpan(note.date) && note.date.year) return note.date;
	return null;
}
export function getSortDate(note) {
	if (note.type === "draft") return note.created;
	let dateObj = null;
	if (note.type === "event") {
		if (note.date && !isSpan(note.date)) dateObj = note.date;
	} else if (note.type === "period") {
		if (note.date && isSpan(note.date)) dateObj = note.date.begin;
	} else if (note.date && !isSpan(note.date) && note.date.year) dateObj = note.date;
	return getPartialDateTime(dateObj, note.created);
}
export function getEndDate(note) {
	if (note.type !== "period") return null;
	if (!note.date || !isSpan(note.date)) return Number.POSITIVE_INFINITY;
	const endObj = note.date.end;
	if (!endObj || endObj.year == null) return Number.POSITIVE_INFINITY;
	const fallbackYear = note.date.begin?.year ?? new Date(note.created).getFullYear();
	return getPartialDateTime(endObj, new Date(fallbackYear, 0, 1).getTime());
}
function getDayStart(time) {
	const d = new Date(time);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}
export function compareNotes(a, b) {
	const dayA = getDayStart(getSortDate(a));
	const dayB = getDayStart(getSortDate(b));
	if (dayA !== dayB) return dayA - dayB;
	const priA = typePriority[a.type] ?? 10;
	const priB = typePriority[b.type] ?? 10;
	if (priA !== priB) return priA - priB;
	return a.created - b.created;
}
export function datePrecision(note) {
	if (note.type === "draft") return "time";
	const partial = placedPartial(note);
	if (!partial || note.type !== "event" && partial.year == null) return "time";
	if (note.type === "event" && partial.year == null && partial.month == null && partial.day == null) return "time";
	if (partial.day) return "day";
	if (partial.month) return "month";
	if (partial.year) return "year";
	return "time";
}
function periodStamp(date) {
	if (!date || date.year == null) return "";
	const parts = [String(date.year)];
	if (date.month != null) parts.push(String(date.month).padStart(2, "0"));
	if (date.day != null) parts.push(String(date.day).padStart(2, "0"));
	return parts.join(" ");
}
export function periodLineLabel(note) {
	const span = note.date && isSpan(note.date) ? note.date : null;
	const begin = periodStamp(span?.begin);
	const end = span?.end && span.end.year != null ? periodStamp(span.end) : "";
	return [begin && end ? `${begin} – ${end}` : begin ? `${begin} –` : end, note.content.replace(/\s+/g, " ").trim()].filter(Boolean).join("  ");
}
export function formatRecorded(ts) {
	return formatUiDate(new Date(ts), {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit"
	});
}
export function formatTrashed(ts) {
	return formatRecorded(ts);
}
function precisionOf(date) {
	if (!date || date.year == null) return "year";
	if (date.day) return "day";
	if (date.month) return "month";
	return "year";
}
function periodEndTime(note) {
	const end = getEndDate(note);
	if (end == null || !Number.isFinite(end)) return null;
	const date = new Date(end);
	date.setHours(23, 59, 59, 999);
	return date.getTime();
}
export function buildRows(notes: Note[], now = Date.now()): TimelineRow[] {
	const items = [];
	for (const note of notes) {
		items.push({
			time: getSortDate(note),
			end: false,
			note
		});
		if (note.type === "period") {
			const end = periodEndTime(note);
			if (end != null) items.push({
				time: end,
				end: true,
				note
			});
		}
	}
	items.sort((a, b) => a.time - b.time || Number(a.end) - Number(b.end) || compareNotes(a.note, b.note));
	const rows = [];
	let year = null;
	let month = null;
	let dayKey = null;
	const stamp = (time, prec) => {
		const d = new Date(time);
		const y = d.getFullYear();
		const m = d.getMonth();
		const dk = `${y}-${m}-${d.getDate()}`;
		if (y !== year) {
			rows.push({
				kind: "year",
				key: `y-${y}`,
				label: String(y)
			});
			year = y;
			month = null;
			dayKey = null;
		}
		if (prec === "year") {
			month = null;
			dayKey = null;
			return;
		}
		if (m !== month) {
			rows.push({
				kind: "month",
				key: `m-${y}-${m}`,
				label: formatUiDate(d, { month: "long" })
			});
			month = m;
			dayKey = null;
		}
		if (prec === "day" || prec === "time") {
			if (dk !== dayKey) {
				rows.push({
					kind: "day",
					key: `d-${dk}`,
					label: formatUiDate(d, {
						weekday: "long",
						month: "long",
						day: "numeric"
					}),
					day: d.getDate()
				});
				dayKey = dk;
			}
		} else dayKey = null;
	};
	const today = getDayStart(now);
	let placed = false;
	const placeNow = () => {
		if (placed) return;
		placed = true;
		stamp(now, "day");
		rows.push({
			kind: "now",
			key: "now"
		});
	};
	for (const item of items) {
		if (getDayStart(item.time) > today) placeNow();
		if (item.end) {
			const end = item.note.date && isSpan(item.note.date) ? item.note.date.end : null;
			stamp(item.time, precisionOf(end));
			rows.push({
				kind: "periodEnd",
				key: `${item.note.id}-end`,
				note: item.note
			});
		} else {
			stamp(item.time, datePrecision(item.note));
			rows.push({
				kind: "note",
				key: item.note.id,
				note: item.note
			});
		}
	}
	placeNow();
	return rows;
}
export function noteMatches(note, filters) {
	const typeOk = note.type === "update" ? filters.types.length === TIMELINE_TYPES.length : filters.types.includes(note.type);
	if (!typeOk) return false;
	if (filters.tags.length > 0 && !filters.tags.every((tag) => note.tags.includes(tag))) return false;
	return true;
}
export function collectTags(notes: Note[]): string[] {
	return [...new Set(notes.flatMap((note) => note.tags))].sort((a, b) => a.localeCompare(b));
}
export function highlightParts(text, query) {
	const needle = query.trim().toLowerCase();
	if (!needle) return [{
		text,
		hit: false
	}];
	const lower = text.toLowerCase();
	const parts = [];
	let index = 0;
	while (index < text.length) {
		const at = lower.indexOf(needle, index);
		if (at === -1) {
			parts.push({
				text: text.slice(index),
				hit: false
			});
			break;
		}
		if (at > index) parts.push({
			text: text.slice(index, at),
			hit: false
		});
		parts.push({
			text: text.slice(at, at + needle.length),
			hit: true
		});
		index = at + Math.max(needle.length, 1);
	}
	return parts.filter((part) => part.text.length > 0);
}
function num(value) {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
	return null;
}
function asPartial(value) {
	if (!value || typeof value !== "object") return null;
	if ("begin" in value || "end" in value) return null;
	const record = value;
	const year = num(record.year);
	const month = num(record.month);
	const day = num(record.day);
	if (year == null && month == null && day == null) return null;
	return {
		year,
		month: month != null && month >= 1 && month <= 12 ? month : null,
		day: day != null && day >= 1 && day <= 31 ? day : null
	};
}
function asSpan(value) {
	if (!value || typeof value !== "object") return null;
	if (!("begin" in value) && !("end" in value)) return null;
	const record = value;
	return {
		begin: asPartial(record.begin),
		end: asPartial(record.end)
	};
}
function normalizeNote(raw) {
	if (!raw || typeof raw !== "object") return null;
	const record = raw;
	const imageHint = typeof record.image === "string" && record.image.trim() !== "";
	const videoHint = typeof record.video === "string" && record.video.trim() !== "";
	if ((typeof record.content !== "string" || record.content.trim() === "") && !imageHint && !videoHint) return null;
	const type = typeof record.type === "string" && record.type.trim() ? record.type.trim() : "note";
	const created = typeof record.created === "number" && Number.isFinite(record.created) ? record.created : Date.now();
	const note = {
		id: record.id != null && String(record.id).trim() ? String(record.id) : crypto.randomUUID(),
		type: type === "idea" ? "note" : type,
		content: typeof record.content === "string" ? record.content : "",
		tags: Array.isArray(record.tags) ? record.tags.filter((tag) => typeof tag === "string" && tag.trim() !== "").map((tag) => tag.trim()) : [],
		created,
		edited: typeof record.edited === "number" && Number.isFinite(record.edited) ? record.edited : created,
		date: type === "period" ? asSpan(record.date) ?? (asPartial(record.date) ? {
			begin: asPartial(record.date),
			end: null
		} : {
			begin: null,
			end: null
		}) : asSpan(record.date) ?? asPartial(record.date)
	};
	if (typeof record.color === "string" && /^#[0-9a-fA-F]{6}$/.test(record.color)) note.color = record.color;
	if (typeof record.trashedAt === "number" && Number.isFinite(record.trashedAt)) note.trashedAt = record.trashedAt;
	if (record.done === true) note.done = true;
	if (typeof record.url === "string" && record.url.trim()) {
		note.url = record.url.trim();
		if (note.type === "link") {
			const preview = storedPreview(record.preview) ?? linkPreview(note.url);
			if (preview) note.preview = preview;
		}
	}
	const image = typeof record.image === "string" ? record.image.trim() : "";
	if (image.startsWith("data:image/") && image.length < 28e4) note.image = image;
	else if (image.startsWith("tlfile:") && image.length < 400) note.image = image;
	else if (/^https:\/\//.test(image) && image.length < 4e3) note.image = image;
	const video = typeof record.video === "string" ? record.video.trim() : "";
	if (video.startsWith("data:video/") && video.length < 1_200_000) note.video = video;
	else if (video.startsWith("data:audio/") && video.length < 1_200_000) note.video = video;
	else if (video.startsWith("tlfile:") && video.length < 400) note.video = video;
	else if (/^https:\/\//.test(video) && video.length < 4e3) note.video = video;
	const imageFacts = cleanMediaFacts(record.imageFacts);
	const videoFacts = cleanMediaFacts(record.videoFacts);
	if (imageFacts) note.imageFacts = imageFacts;
	if (videoFacts) note.videoFacts = videoFacts;
	if (typeof record.attachedTo === "string" && record.attachedTo.trim()) note.attachedTo = record.attachedTo.trim();
	if (typeof record.parentId === "string" && record.parentId.trim() && record.parentId.trim() !== note.id) note.parentId = record.parentId.trim();
	if (typeof record.rank === "number" && Number.isFinite(record.rank)) note.rank = record.rank;
	if (Array.isArray(record.sources)) {
		const sources = record.sources.map(normalizeSource).filter((source) => source != null);
		if (sources.length > 0) note.sources = sources;
	}
	const originalLanguage = cleanText(record.originalLanguage);
	if (originalLanguage) note.originalLanguage = originalLanguage;
	if (Array.isArray(record.languages)) {
		const languages = record.languages.map(normalizeLanguage).filter((language) => language != null);
		if (languages.length > 0) note.languages = languages;
	}
	const labels = normalizeLabels(record.labels);
	if (labels.length > 0) note.labels = labels;
	else if (type === "quotation") note.labels = [{
		text: note.content.trim(),
		language: cleanText(record.originalLanguage)
	}];
	const description = cleanText(record.description);
	if (description) note.description = description;
	const designation = cleanText(record.designation).toLowerCase();
	if (DESIGNATIONS.includes(designation)) note.designation = designation;
	const statements = normalizeStatements(record.statements);
	if (statements.length > 0) note.statements = statements;
	const book = normalizeBook(record.book);
	if (book) note.book = book;
	return note;
}
function normalizeBook(value) {
	if (!value || typeof value !== "object") return void 0;
	const record = value;
	const list = (item) => Array.isArray(item) ? item.map((part) => cleanText(part)).filter(Boolean) : cleanText(item).split(",").map((part) => part.trim()).filter(Boolean);
	const book = {
		subtitle: cleanText(record.subtitle),
		authors: list(record.authors),
		translators: list(record.translators),
		language: cleanText(record.language),
		originalTitle: cleanText(record.originalTitle),
		originalLanguage: cleanText(record.originalLanguage),
		form: cleanText(record.form).toLowerCase(),
		publisher: cleanText(record.publisher),
		place: cleanText(record.place),
		published: cleanText(record.published),
		edition: cleanText(record.edition),
		isbn: cleanText(record.isbn),
		subjects: list(record.subjects)
	};
	return Object.values(book).some((item) => Array.isArray(item) ? item.length > 0 : item !== "") ? book : void 0;
}
function normalizeLabels(value) {
	if (!Array.isArray(value)) return [];
	const labels = [];
	for (const item of value) if (typeof item === "string" && item.trim()) labels.push({
		text: item.trim(),
		language: ""
	});
	else if (item && typeof item === "object") {
		const text = cleanText(item.text);
		const language = cleanText(item.language);
		if (text) labels.push({
			text,
			language
		});
	}
	return labels;
}
function normalizeStatements(value) {
	if (!Array.isArray(value)) return [];
	const statements = [];
	for (const item of value) {
		if (!item || typeof item !== "object") continue;
		const record = item;
		const property = cleanText(record.property);
		const stated = cleanText(record.value);
		if (!property || !stated) continue;
		const qualifiers = Array.isArray(record.qualifiers) ? record.qualifiers.map((qualifier) => {
			if (!qualifier || typeof qualifier !== "object") return null;
			const pair = qualifier;
			const name = cleanText(pair.property);
			const text = cleanText(pair.value);
			return name && text ? {
				property: name,
				value: text
			} : null;
		}).filter((qualifier) => qualifier != null) : [];
		statements.push({
			id: cleanText(record.id) || crypto.randomUUID(),
			property,
			value: stated,
			qualifiers,
			source: cleanText(record.source),
			sourceUrl: cleanText(record.sourceUrl)
		});
	}
	return statements;
}
function storedPreview(value) {
	if (!value || typeof value !== "object") return null;
	const record = value;
	if (record.kept !== true) return null;
	const site = cleanText(record.site);
	const line = cleanText(record.line);
	if (!site && !line) return null;
	const preview = {
		site: site || line,
		line: line || site,
		kept: true
	};
	const image = cleanText(record.image);
	if (image.startsWith("data:image/") && image.length < 28e4) preview.image = image;
	else if (image.startsWith("tlfile:") && image.length < 400) preview.image = image;
	else if (/^https:\/\//.test(image) && image.length < 4e3) preview.image = image;
	if (!preview.image && record.bare === true) preview.bare = true;
	return preview;
}
function cleanText(value) {
	return typeof value === "string" ? value.trim() : "";
}
function normalizeLanguage(raw) {
	if (!raw || typeof raw !== "object") return null;
	const record = raw;
	const language = cleanText(record.language);
	const text = cleanText(record.text);
	if (!language && !text) return null;
	const translator = cleanText(record.translator);
	const entry = {
		id: cleanText(record.id) || crypto.randomUUID(),
		language,
		text
	};
	if (translator) entry.translator = translator;
	return entry;
}
function normalizeSource(raw) {
	if (!raw || typeof raw !== "object") return null;
	const record = raw;
	const source = {
		id: cleanText(record.id) || crypto.randomUUID(),
		author: cleanText(record.author),
		work: cleanText(record.work),
		container: cleanText(record.container),
		edition: cleanText(record.edition),
		locator: cleanText(record.locator),
		published: cleanText(record.published),
		url: cleanText(record.url)
	};
	return Object.entries(source).some(([key, value]) => key !== "id" && value !== "") ? source : null;
}
export function formatSource(source) {
	return [
		source.author,
		source.work,
		source.container,
		source.edition,
		source.published,
		source.locator
	].map((part) => part.trim()).filter(Boolean).join(", ");
}
function sameWords(left, right) {
	return left.trim().toLowerCase() === right.trim().toLowerCase();
}
function wrapQuote(text) {
	const trimmed = text.trim();
	if (!trimmed) return "";
	return /^[“"«„「『]/.test(trimmed) && /[”"»」』]$/.test(trimmed) ? trimmed : `“${trimmed}”`;
}
/** The wording in the app language leads. The original follows only when it is a different language. */
export function quotationFaces(note) {
	const wanted = currentLanguage();
	const original = note.content.trim();
	const originalLanguage = note.originalLanguage?.trim() ?? "";
	const translation = (note.languages ?? []).find((item) => languageMatches(item.language, wanted) && item.text.trim());
	const originalIsWanted = languageMatches(originalLanguage, wanted);
	const same = Boolean(translation && sameWords(translation.text, original));
	if (originalIsWanted || !translation) {
		const own = (note.languages ?? []).find((item) => languageMatches(item.language, originalLanguage) && sameWords(item.text, original) && item.translator?.trim());
		return {
			primary: original,
			original,
			originalLanguage,
			showOriginal: false,
			translator: originalIsWanted ? own?.translator?.trim() ?? "" : ""
		};
	}
	return {
		primary: translation.text.trim(),
		original,
		originalLanguage,
		showOriginal: Boolean(original) && !same,
		translator: translation.translator?.trim() ?? ""
	};
}
export function citedQuotation(note) {
	const faces = quotationFaces(note);
	const lines = [wrapQuote(faces.primary)];
	if (faces.translator) lines.push(`Translated by ${faces.translator}`);
	if (faces.showOriginal && faces.original.trim()) {
		lines.push("", wrapQuote(faces.original));
		if (faces.originalLanguage) lines.push(faces.originalLanguage);
	}
	const cites = (note.sources ?? []).map((source) => {
		const line = formatSource(source);
		const href = safeHref(source.url);
		if (line && href) return `${line}, ${href}`;
		return line || href;
	}).filter(Boolean);
	if (cites.length > 0) lines.push("", ...cites.map((line) => `— ${line}`));
	else {
		const author = (note.statements ?? []).find((item) => item.property.trim().toLowerCase() === "author")?.value.trim();
		if (author) lines.push("", `— ${author}`);
	}
	return lines.join("\n");
}
export function tidyUrl(value) {
	const trimmed = value.trim();
	if (!trimmed) return "";
	if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
	return `https://${trimmed}`;
}
export function safeHref(value) {
	const url = tidyUrl(value);
	if (!url) return "";
	try {
		const parsed = new URL(url);
		if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:") return parsed.href;
	} catch {
		return "";
	}
	return "";
}
export function safeImage(value) {
	if (!value) return "";
	if (value.startsWith("tlfile:")) return value;
	if (value.startsWith("data:image/") && value.length < 28e4) return value;
	return safeHref(value);
}
export function safeVideo(value) {
	if (!value || typeof value !== "string") return "";
	if (value.startsWith("tlfile:")) return value;
	if (value.startsWith("data:video/") && value.length < 1_200_000) return value;
	if (value.startsWith("data:audio/") && value.length < 1_200_000) return value;
	if (/^https:\/\//.test(value) && value.length < 4e3) return value;
	return "";
}
export function cleanMediaFacts(value): MediaFacts | undefined {
	if (!value || typeof value !== "object") return undefined;
	const record = value;
	const facts: MediaFacts = {};
	const name = typeof record.name === "string" ? record.name.trim().slice(0, 180) : "";
	if (name) facts.name = name;
	const width = bounded(record.width, 1, 20000);
	const height = bounded(record.height, 1, 20000);
	const bytes = bounded(record.bytes, 1, 2_000_000_000);
	const seconds = bounded(record.seconds, 0.01, 60 * 60 * 48);
	if (width) facts.width = width;
	if (height) facts.height = height;
	if (bytes) facts.bytes = Math.round(bytes);
	if (seconds) facts.seconds = Math.round(seconds * 10) / 10;
	const url = typeof record.url === "string" ? record.url.trim() : "";
	if (/^https?:\/\//.test(url) && url.length < 2000) facts.url = url;
	return Object.keys(facts).length > 0 ? facts : undefined;
}
function bounded(value, min, max) {
	const number = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(number) || number < min || number > max) return 0;
	return number;
}
export function mediaLine(facts?: MediaFacts) {
	if (!facts) return "";
	const parts: string[] = [];
	if (facts.name) parts.push(facts.name);
	if (facts.width && facts.height) parts.push(`${facts.width}×${facts.height}`);
	if (facts.bytes) parts.push(formatBytes(facts.bytes));
	if (facts.seconds) parts.push(clock(facts.seconds));
	return parts.join(" · ");
}
function clock(seconds: number) {
	const whole = Math.round(seconds);
	const minutes = Math.floor(whole / 60);
	const hours = Math.floor(minutes / 60);
	const rest = whole % 60;
	if (hours) return `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
	return `${minutes}:${String(rest).padStart(2, "0")}`;
}
const URL_IN_TEXT = /https?:\/\/[^\s<>]+/gi;
const QUOTE_PAIRS = [
	["\"", "\""],
	["“", "”"],
	["‘", "’"],
	["«", "»"],
	["「", "」"],
	["『", "』"],
	["„", "“"],
	["‚", "‘"]
];
/** A new note that is itself a quotation, optionally with a short attribution after the close. */
export function quotationFromText(content) {
	const trimmed = content.trim();
	const open = trimmed[0] ?? "";
	const pair = QUOTE_PAIRS.find(([mark]) => mark === open);
	if (!pair) return null;
	const end = trimmed.lastIndexOf(pair[1]);
	if (end <= 0) return null;
	const text = trimmed.slice(1, end).trim();
	const aside = trimmed.slice(end + 1).trim().replace(/^[\s—–\-:]+/, "");
	if (text.length < 2 || aside.length > 80) return null;
	const [author, ...rest] = aside.split(/\s*,\s*/).filter(Boolean);
	return {
		text,
		author: author ?? "",
		work: rest.join(", ")
	};
}
/** A new note that is an address, or an address with only a short line beside it. */
export function linkFromText(content) {
	const trimmed = content.trim();
	if (!trimmed) return null;
	const found = [...trimmed.matchAll(URL_IN_TEXT)].map((match) => match[0].replace(/[),.]+$/, ""));
	const only = found.length === 0 && !/\s/.test(trimmed) ? trimmed : "";
	const raw = found.length === 1 ? found[0] : only;
	if (!raw) return null;
	const href = safeHref(raw);
	if (!href.startsWith("http")) return null;
	let host = "";
	try {
		host = new URL(href).hostname;
	} catch {
		return null;
	}
	if (!host.includes(".")) return null;
	const leftover = trimmed.replace(raw, "").replace(/\s+/g, " ").trim();
	if (leftover.length > 80) return null;
	const preview = linkPreview(href) ?? void 0;
	return {
		content: leftover || (preview && preview.line !== host ? `${preview.site} — ${preview.line}` : host),
		url: href,
		preview
	};
}
function hostOf(url) {
	return url.hostname.replace(/^www\./, "");
}
function piece(value) {
	try {
		return decodeURIComponent(value).replace(/[_+]+/g, " ").trim();
	} catch {
		return value.replace(/[_+]+/g, " ").trim();
	}
}
function youtubeId(url) {
	const host = hostOf(url);
	if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? "";
	if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com" || host === "youtube-nocookie.com") {
		if (url.pathname === "/watch") return url.searchParams.get("v") ?? "";
		return url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?]+)/)?.[1] ?? "";
	}
	return "";
}
/** A preview read from the address itself. Nothing is fetched, so the note stays private and offline. */
export function linkPreview(value) {
	const href = safeHref(value);
	if (!href || href.startsWith("mailto:")) return null;
	let url;
	try {
		url = new URL(href);
	} catch {
		return null;
	}
	const host = hostOf(url);
	const parts = url.pathname.split("/").filter(Boolean);
	const video = youtubeId(url);
	if (video && /^[\w-]{6,}$/.test(video)) return {
		site: host.startsWith("music.youtube") ? "YouTube Music" : "YouTube",
		line: "Video",
		image: `https://i.ytimg.com/vi/${video}/hqdefault.jpg`
	};
	if (host === "vimeo.com" && /^\d+$/.test(parts[0] ?? "")) return {
		site: "Vimeo",
		line: "Video"
	};
	if (host.endsWith("wikipedia.org") && parts[0] === "wiki" && parts[1]) return {
		site: "Wikipedia",
		line: piece(parts.slice(1).join(" / "))
	};
	if (host === "github.com" && parts.length >= 2) return {
		site: "GitHub",
		line: `${piece(parts[0])} / ${piece(parts[1])}`
	};
	if ((host === "x.com" || host === "twitter.com") && parts[0] && parts[0] !== "i") return {
		site: "X",
		line: parts[1] === "status" ? `@${piece(parts[0])}` : `@${piece(parts[0])}`
	};
	if (host === "bsky.app" && parts[0] === "profile" && parts[1]) return {
		site: "Bluesky",
		line: `@${piece(parts[1])}`
	};
	if (host === "instagram.com" && parts[0]) return {
		site: "Instagram",
		line: parts[0] === "p" || parts[0] === "reel" || parts[0] === "reels" ? "Post" : `@${piece(parts[0])}`
	};
	if (host === "tiktok.com" && parts[0]?.startsWith("@")) return {
		site: "TikTok",
		line: piece(parts[0])
	};
	if (host === "reddit.com" && parts[0] === "r" && parts[1]) return {
		site: "Reddit",
		line: `r/${piece(parts[1])}`
	};
	if (host.endsWith("reddit.com") && parts[0] === "r" && parts[1]) return {
		site: "Reddit",
		line: `r/${piece(parts[1])}`
	};
	if (host === "open.spotify.com" && parts[0] && parts[1]) return {
		site: "Spotify",
		line: `${piece(parts[0])} · ${piece(parts[1])}`
	};
	if ((host === "soundcloud.com" || host === "m.soundcloud.com") && parts[0]) return {
		site: "SoundCloud",
		line: piece(parts[0])
	};
	if (host === "archive.org" && parts[0] === "details" && parts[1]) return {
		site: "Internet Archive",
		line: piece(parts[1])
	};
	if (host.endsWith("wikisource.org") && parts[0] === "wiki" && parts[1]) return {
		site: "Wikisource",
		line: piece(parts.slice(1).join(" / "))
	};
	if (host === "plato.stanford.edu" && parts[0] === "entries" && parts[1]) return {
		site: "Stanford Encyclopedia",
		line: piece(parts[1])
	};
	if ((host === "threads.net" || host === "www.threads.net") && parts[0]?.startsWith("@")) return {
		site: "Threads",
		line: piece(parts[0])
	};
	if (host === "linkedin.com" && parts[0] && parts[1]) return {
		site: "LinkedIn",
		line: `${piece(parts[0])} · ${piece(parts[1])}`
	};
	if (host.endsWith("facebook.com") && parts[0]) return {
		site: "Facebook",
		line: piece(parts[0])
	};
	if (parts[0]?.startsWith("@")) return {
		site: host,
		line: piece(parts[0])
	};
	return {
		site: host,
		line: parts.length > 0 ? parts.slice(0, 2).map(piece).join(" / ") : host
	};
}
export function parseImport(raw) {
	let notesRaw = null;
	let trashRaw = [];
	if (Array.isArray(raw)) notesRaw = raw;
	else if (raw && typeof raw === "object" && Array.isArray(raw.notes)) {
		const record = raw;
		notesRaw = record.notes;
		if (Array.isArray(record.trash)) trashRaw = record.trash;
	}
	if (!notesRaw) return null;
	const notes = [];
	const trash = [];
	const seen = /* @__PURE__ */ new Set();
	const take = (item, forceTrash) => {
		const note = normalizeNote(item);
		if (!note || seen.has(note.id)) return;
		seen.add(note.id);
		if (forceTrash || note.trashedAt) trash.push(note);
		else notes.push(note);
	};
	notesRaw.forEach((item) => take(item, false));
	trashRaw.forEach((item) => take(item, true));
	return {
		notes,
		trash
	};
}
export function formatBytes(bytes) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
	return `${(bytes / 1073741824).toFixed(1)} GB`;
}
export function readPartial(year, month, day) {
	const y = year.trim() === "" ? null : Number(year);
	const m = month.trim() === "" ? null : Number(month);
	const d = day.trim() === "" ? null : Number(day);
	if (y == null && m == null && d == null) return null;
	if (y != null && (!Number.isFinite(y) || y < 1 || y > 9999)) return null;
	return {
		year: y != null && Number.isFinite(y) ? y : null,
		month: m != null && m >= 1 && m <= 12 ? m : null,
		day: d != null && d >= 1 && d <= 31 ? d : null
	};
}
export function partialFields(date) {
	return {
		year: date?.year != null ? String(date.year) : "",
		month: date?.month != null ? String(date.month) : "",
		day: date?.day != null ? String(date.day) : ""
	};
}
