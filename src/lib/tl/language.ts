/** The language the app prefers. "system" follows the device. */

const ALIASES: Record<string, string> = {
  en: "en",
  eng: "en",
  english: "en",
  la: "la",
  lat: "la",
  latin: "la",
  "lingua latina": "la",
  "lingua latīna": "la",
  grc: "grc",
  greek: "grc",
  "ancient greek": "grc",
  el: "el",
  "modern greek": "el",
  zh: "zh",
  chinese: "zh",
  "zh-hans": "zh",
  "zh-hant": "zh",
  sa: "sa",
  sanskrit: "sa",
  pi: "pi",
  pali: "pi",
  he: "he",
  heb: "he",
  hebrew: "he",
  it: "it",
  italian: "it",
  fa: "fa",
  persian: "fa",
  farsi: "fa",
  ja: "ja",
  japanese: "ja",
  de: "de",
  german: "de",
  deutsch: "de",
  ar: "ar",
  arabic: "ar",
  fr: "fr",
  french: "fr",
  français: "fr",
  francais: "fr",
  es: "es",
  spanish: "es",
  español: "es",
  espanol: "es",
  pt: "pt",
  portuguese: "pt",
  ru: "ru",
  russian: "ru",
  nl: "nl",
  dutch: "nl",
  pl: "pl",
  polish: "pl",
  uk: "uk",
  ukrainian: "uk",
  sv: "sv",
  swedish: "sv",
  cs: "cs",
  czech: "cs",
  da: "da",
  danish: "da",
  fi: "fi",
  finnish: "fi",
  hu: "hu",
  hungarian: "hu",
  ro: "ro",
  romanian: "ro",
  tr: "tr",
  turkish: "tr",
  vi: "vi",
  vietnamese: "vi",
  ko: "ko",
  korean: "ko",
  hi: "hi",
  hindi: "hi",
  bn: "bn",
  bengali: "bn",
  ta: "ta",
  tamil: "ta",
  id: "id",
  indonesian: "id",
  ca: "ca",
  catalan: "ca",
  eo: "eo",
  esperanto: "eo",
  arc: "arc",
  aramaic: "arc",
  "transliterated aramaic": "arc",
  syriac: "arc",
  syc: "arc",
  "classical syriac": "arc",
  agl: "agl",
  anglish: "agl",
  wyc: "wyc",
  wycliffe: "wyc",
  wyclif: "wyc",
  wycliffite: "wyc",
  "wycliffe english": "wyc",
  "english - wycliffe": "wyc",
  "middle english": "wyc",
  enm: "wyc",
  kjv: "kjv",
  "king james": "kjv",
  "king james english": "kjv",
  "english - king james": "kjv",
  "authorized version": "kjv",
  ang: "ang",
  "old english": "ang",
  "anglo-saxon": "ang",
  englisc: "ang",
  beowulf: "ang",
  "old english - beowulf": "ang",
  oe: "ang",
  ga: "ga",
  irish: "ga",
  gaeilge: "ga",
  "irish gaelic": "ga",
  "gaelic - irish": "ga",
  "gaelic irish": "ga",
  gd: "gd",
  gàidhlig: "gd",
  gaidhlig: "gd",
  "scottish gaelic": "gd",
  "scots gaelic": "gd",
  "gaelic - scottish": "gd",
  "gaelic scottish": "gd",
};

const NAMES: Record<string, string> = {
  en: "English",
  la: "Lingua Latīna",
  grc: "Ancient Greek",
  el: "Greek",
  zh: "Chinese",
  sa: "Sanskrit",
  pi: "Pali",
  he: "Hebrew",
  it: "Italian",
  fa: "Persian",
  ja: "Japanese",
  de: "German",
  ar: "Arabic",
  fr: "French",
  es: "Spanish",
  pt: "Portuguese",
  ru: "Russian",
  nl: "Dutch",
  pl: "Polish",
  uk: "Ukrainian",
  sv: "Swedish",
  cs: "Czech",
  da: "Danish",
  fi: "Finnish",
  hu: "Hungarian",
  ro: "Romanian",
  tr: "Turkish",
  vi: "Vietnamese",
  ko: "Korean",
  hi: "Hindi",
  bn: "Bengali",
  ta: "Tamil",
  id: "Indonesian",
  ca: "Catalan",
  eo: "Esperanto",
  arc: "Aramaic",
  agl: "Anglish",
  wyc: "Wycliffe English",
  kjv: "King James English",
  ang: "Old English",
  ga: "Irish",
  gd: "Scottish Gaelic",
};

export type LanguageChoice = { id: string; label: string };

/** Languages with a full wording of the app, in the order the menu uses. */
export const SPOKEN: { id: string; label: string }[] = [
  { id: "agl", label: "Anglish" },
  { id: "wyc", label: "English - Wycliffe" },
  { id: "kjv", label: "English - King James" },
  { id: "ang", label: "Old English - Beowulf" },
  { id: "ga", label: "Gaelic - Irish" },
  { id: "gd", label: "Gaelic - Scottish" },
  { id: "es", label: "Español" },
  { id: "fr", label: "Français" },
  { id: "de", label: "Deutsch" },
  { id: "it", label: "Italiano" },
  { id: "pt", label: "Português" },
  { id: "nl", label: "Nederlands" },
  { id: "el", label: "Ελληνικά" },
  { id: "ru", label: "Русский" },
  { id: "zh", label: "中文" },
  { id: "ja", label: "日本語" },
  { id: "ar", label: "العربية" },
  { id: "pl", label: "Polski" },
  { id: "uk", label: "Українська" },
  { id: "sv", label: "Svenska" },
  { id: "cs", label: "Čeština" },
  { id: "da", label: "Dansk" },
  { id: "fi", label: "Suomi" },
  { id: "hu", label: "Magyar" },
  { id: "ro", label: "Română" },
  { id: "tr", label: "Türkçe" },
  { id: "vi", label: "Tiếng Việt" },
  { id: "ko", label: "한국어" },
  { id: "hi", label: "हिन्दी" },
  { id: "bn", label: "বাংলা" },
  { id: "ta", label: "தமிழ்" },
  { id: "id", label: "Indonesia" },
  { id: "ca", label: "Català" },
  { id: "eo", label: "Esperanto" },
  { id: "grc", label: "Ἀρχαία Ἑλληνική" },
  { id: "sa", label: "संस्कृतम्" },
  { id: "pi", label: "Pāli" },
  { id: "he", label: "עברית" },
  { id: "fa", label: "فارسی" },
  { id: "arc", label: "Ārāmāʾīṯ" },
];

const SPOKEN_IDS = new Set(SPOKEN.map((item) => item.id));

/** True when this code has a wording for the buttons, not only for quotations. */
export function speaksLanguage(code: string) {
  return code === "en" || code === "la" || SPOKEN_IDS.has(code);
}

export function languageCode(value: string): string {
  const key = value.trim().toLowerCase().replace(/_/g, "-");
  if (!key) return "";
  if (ALIASES[key]) return ALIASES[key];
  const primary = key.split("-")[0] ?? key;
  if (ALIASES[primary]) return ALIASES[primary];
  if (/^[a-z]{2,3}$/.test(primary)) return primary;
  if (/^[\p{L}][\p{L}\p{N} .'-]{1,40}$/u.test(value.trim()) && value.trim().length <= 32) return key;
  return "";
}

export function languageName(value: string): string {
  const code = languageCode(value);
  if (!code) return value.trim();
  if (NAMES[code]) return NAMES[code];
  if (/^[a-z]{2,3}$/.test(code)) return code;
  return code.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

export function languageMatches(value: string, wanted: string) {
  const left = languageCode(value);
  const right = languageCode(wanted);
  return Boolean(left && right && left === right);
}

export function systemLanguage() {
  if (typeof navigator === "undefined") return "en";
  const tag = navigator.languages?.[0] || navigator.language || "en";
  return languageCode(tag) || "en";
}

export function resolveAppLanguage(setting: string | undefined) {
  if (!setting || setting === "system") return systemLanguage();
  return languageCode(setting) || systemLanguage();
}

function readBoot() {
  try {
    if (typeof localStorage === "undefined") return systemLanguage();
    const parsed = JSON.parse(localStorage.getItem("tlnotes.v1") || "{}") as { settings?: { language?: string } };
    return resolveAppLanguage(parsed.settings?.language);
  } catch {
    return systemLanguage();
  }
}

let active = readBoot();

export function currentLanguage() {
  return active;
}

const LATIN_MONTH = ["Iānuārius", "Februārius", "Mārtius", "Aprīlis", "Māius", "Iūnius", "Iūlius", "Augustus", "September", "Octōber", "November", "December"];
const LATIN_MONTH_GEN = ["Iānuāriī", "Februāriī", "Mārtiī", "Aprīlis", "Māiī", "Iūniī", "Iūliī", "Augustī", "Septembris", "Octōbris", "Novembris", "Decembris"];
const LATIN_MONTH_SHORT = ["Iān", "Feb", "Mār", "Apr", "Māi", "Iūn", "Iūl", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LATIN_WEEKDAY = ["diēs Sōlis", "diēs Lūnae", "diēs Mārtis", "diēs Mercuriī", "diēs Iovis", "diēs Veneris", "diēs Sāturnī"];
const ROMAN_GLYPHS: [number, string][] = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];
const ROMAN_VALUE: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

/** A whole number as a Roman numeral. Zero, which Latin has no figure for, is nulla. */
export function romanNumeral(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const negative = value < 0;
  let n = Math.trunc(Math.abs(value));
  if (n === 0) return "nulla";
  let out = "";
  for (const [amount, glyph] of ROMAN_GLYPHS) {
    while (n >= amount) {
      out += glyph;
      n -= amount;
    }
  }
  return negative ? `−${out}` : out;
}

/** Read a Roman numeral, or nulla. IIII is accepted as well as IV. */
export function parseRoman(text: string): number | null {
  const trimmed = text.trim();
  if (/^nulla$/i.test(trimmed)) return 0;
  const negative = trimmed.startsWith("−") || trimmed.startsWith("-");
  const body = (negative ? trimmed.slice(1) : trimmed).toUpperCase();
  if (!/^[IVXLCDM]+$/.test(body)) return null;
  let total = 0;
  let prev = 0;
  for (let i = body.length - 1; i >= 0; i--) {
    const cur = ROMAN_VALUE[body[i]!] ?? 0;
    if (cur < prev) total -= cur;
    else {
      total += cur;
      prev = cur;
    }
  }
  if (total <= 0) return null;
  return negative ? -total : total;
}

/** A count, as a Roman numeral when the app is speaking Latin. */
export function uiNumber(value: number): string {
  if (currentLanguage() !== "la" || !Number.isInteger(value)) return String(value);
  return romanNumeral(value);
}

/** An integer written in digits, shown as a Roman numeral in Latin. Other text is left alone. */
export function uiNumeral(text: string): string {
  if (currentLanguage() !== "la" || !/^-?\d+$/.test(text)) return text;
  return romanNumeral(Number(text));
}

function latinClock(date: Date) {
  return `${romanNumeral(date.getHours())}·${romanNumeral(date.getMinutes())}`;
}

const ANGLISH_WEEKDAY = ["Sunday", "Monday", "Tiwesday", "Wodnesday", "Thunresday", "Friday", "Saterday"];
const ANGLISH_MONTH = ["Afteryule", "Solmonth", "Rethemonth", "Eastermonth", "Threemilk", "Forelithe", "Afterlithe", "Weedmonth", "Holymonth", "Winterfulth", "Blotmonth", "Ereyule"];
const ANGLISH_SHORT = ["Aft", "Sol", "Ret", "Eas", "Thr", "For", "Lit", "Wee", "Hol", "Win", "Blo", "Ere"];

const WYCLIFFE_WEEKDAY = ["Soneday", "Moneday", "Tiwesday", "Wednesdai", "Thuresday", "Fridai", "Saterdai"];
const WYCLIFFE_MONTH = ["Janeuer", "Feuerer", "March", "Averil", "May", "Juyn", "Juyl", "August", "Septembre", "Octobre", "Novembre", "Decembre"];
const WYCLIFFE_SHORT = ["Jan", "Feu", "Mar", "Ave", "May", "Juy", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const KJV_WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const KJV_MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const KJV_SHORT = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];

const OLD_ENGLISH_WEEKDAY = ["Sunnandæg", "Mōnandæg", "Tīwesdæg", "Wōdnesdæg", "Þunresdæg", "Frīgedæg", "Sæternesdæg"];
const OLD_ENGLISH_MONTH = ["Æfterra Gēola", "Solmōnaþ", "Hrēþmōnaþ", "Ēastermōnaþ", "Þrīmilce", "Ǣrra Līþa", "Æfterra Līþa", "Wēodmōnaþ", "Hāligmōnaþ", "Winterfylleþ", "Blōtmōnaþ", "Ǣrra Gēola"];
const OLD_ENGLISH_SHORT = ["Æft.G", "Sol", "Hrēþ", "Ēast", "Þrīm", "Ǣr.L", "Æft.L", "Wēod", "Hāl", "Wint", "Blōt", "Ǣr.G"];

function dayOrdinal(day: number) {
  const teen = day % 100;
  if (teen >= 11 && teen <= 13) return `${day}th`;
  const last = day % 10;
  if (last === 1) return `${day}st`;
  if (last === 2) return `${day}nd`;
  if (last === 3) return `${day}rd`;
  return `${day}th`;
}

function clock24(date: Date) {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** Dates these tongues would have written, because no browser locale speaks them. */
function historicalDate(date: Date, options: Intl.DateTimeFormatOptions, weekday: string[], month: string[], monthShort: string[], shape: "plain" | "kjv") {
  const day = date.getDate();
  const mon = date.getMonth();
  const year = date.getFullYear();
  const hasTime = options.hour != null || options.minute != null;
  if (options.weekday && options.month && options.day) {
    if (shape === "kjv") return `${weekday[date.getDay()]}, the ${dayOrdinal(day)} day of ${month[mon]}`;
    return `${weekday[date.getDay()]}, ${day} ${month[mon]}`;
  }
  if (options.month === "long" && !options.day && !options.year) return month[mon];
  if (hasTime) {
    const body = shape === "kjv" ? `the ${dayOrdinal(day)} of ${monthShort[mon]} ${year}` : `${day} ${monthShort[mon]} ${year}`;
    return `${body}, ${clock24(date)}`;
  }
  if (shape === "kjv") return `the ${dayOrdinal(day)} day of ${month[mon]}, ${year}`;
  return `${day} ${month[mon]} ${year}`;
}

/** Dates follow the app language. Latin is written out, because browsers do not agree on a Latin locale. */
export function formatUiDate(date: Date, options: Intl.DateTimeFormatOptions) {
  const lang = currentLanguage();
  if (lang === "agl") return historicalDate(date, options, ANGLISH_WEEKDAY, ANGLISH_MONTH, ANGLISH_SHORT, "plain");
  if (lang === "wyc") return historicalDate(date, options, WYCLIFFE_WEEKDAY, WYCLIFFE_MONTH, WYCLIFFE_SHORT, "plain");
  if (lang === "kjv") return historicalDate(date, options, KJV_WEEKDAY, KJV_MONTH, KJV_SHORT, "kjv");
  if (lang === "ang") return historicalDate(date, options, OLD_ENGLISH_WEEKDAY, OLD_ENGLISH_MONTH, OLD_ENGLISH_SHORT, "plain");
  if (lang !== "la") {
    const locale = lang === "zh" ? "zh-Hans" : lang === "ga" ? "ga-IE" : lang === "gd" ? "gd-GB" : lang || "en";
    const hasTime = options.hour != null || options.minute != null;
    return hasTime ? date.toLocaleString(locale, options) : date.toLocaleDateString(locale, options);
  }
  const day = romanNumeral(date.getDate());
  const month = date.getMonth();
  const year = romanNumeral(date.getFullYear());
  if (options.weekday && options.month && options.day) return `${LATIN_WEEKDAY[date.getDay()]}, ${day} ${LATIN_MONTH_GEN[month]}`;
  if (options.month === "long" && !options.day && !options.year) return LATIN_MONTH[month];
  if (options.hour != null || options.minute != null) return `${day} ${LATIN_MONTH_SHORT[month]} ${year}, ${latinClock(date)}`;
  return `${day} ${LATIN_MONTH[month]} ${year}`;
}

export function applyLanguage(setting: string | undefined) {
  active = resolveAppLanguage(setting);
  if (typeof document === "undefined") return;
  document.documentElement.lang = /^[a-z]{2,3}$/.test(active) ? active : "en";
  document.documentElement.dir = active === "ar" || active === "he" || active === "fa" ? "rtl" : "ltr";
}

export function cleanLanguageSetting(value: unknown) {
  if (typeof value !== "string") return "system";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === "system") return "system";
  const code = languageCode(trimmed);
  return code || "system";
}

export function languageChoices(
  notes: { originalLanguage?: string; languages?: { language: string }[]; labels?: { language: string }[]; book?: { language?: string; originalLanguage?: string } }[],
  current?: string,
) {
  const system = systemLanguage();
  const choices: LanguageChoice[] = [
    { id: "system", label: `This device · ${languageName(system)}` },
    { id: "en", label: "English" },
    { id: "la", label: "Lingua Latīna" },
    ...SPOKEN,
  ];
  const seen = new Set(choices.map((choice) => choice.id));
  const found: string[] = [];
  for (const note of notes) {
    const raw = [
      note.originalLanguage,
      ...(note.languages ?? []).map((item) => item.language),
      ...(note.labels ?? []).map((item) => item.language),
      note.book?.language,
      note.book?.originalLanguage,
    ];
    for (const item of raw) {
      const code = item ? languageCode(item) : "";
      if (!code || seen.has(code) || SPOKEN_IDS.has(code) || code === "en" || code === "la") continue;
      seen.add(code);
      found.push(code);
    }
  }
  found.sort((a, b) => languageName(a).localeCompare(languageName(b)));
  for (const code of found) choices.push({ id: code, label: languageName(code) });
  if (current && current !== "system") {
    const code = languageCode(current);
    if (code && !choices.some((choice) => choice.id === code)) choices.push({ id: code, label: languageName(code) });
  }
  return choices;
}
