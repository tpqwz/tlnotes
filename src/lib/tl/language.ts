/** The language the app prefers. "system" follows the device. */

const ALIASES: Record<string, string> = {
  en: "en",
  eng: "en",
  english: "en",
  la: "la",
  lat: "la",
  latin: "la",
  "lingua latina": "la",
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
};

const NAMES: Record<string, string> = {
  en: "English",
  la: "Lingua Latina",
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
};

export type LanguageChoice = { id: string; label: string };

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

const LATIN_MONTH = ["Ianuarius", "Februarius", "Martius", "Aprilis", "Maius", "Iunius", "Iulius", "Augustus", "September", "October", "November", "December"];
const LATIN_MONTH_GEN = ["Ianuarii", "Februarii", "Martii", "Aprilis", "Maii", "Iunii", "Iulii", "Augusti", "Septembris", "Octobris", "Novembris", "Decembris"];
const LATIN_MONTH_SHORT = ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LATIN_WEEKDAY = ["dies Solis", "dies Lunae", "dies Martis", "dies Mercurii", "dies Iovis", "dies Veneris", "dies Saturni"];

/** Dates follow the app language. Latin is written out, because browsers do not agree on a Latin locale. */
export function formatUiDate(date: Date, options: Intl.DateTimeFormatOptions) {
  const lang = currentLanguage();
  if (lang !== "la") {
    const locale = lang === "zh" ? "zh-Hans" : lang || "en";
    const hasTime = options.hour != null || options.minute != null;
    return hasTime ? date.toLocaleString(locale, options) : date.toLocaleDateString(locale, options);
  }
  const day = date.getDate();
  const month = date.getMonth();
  const year = date.getFullYear();
  if (options.weekday && options.month && options.day) return `${LATIN_WEEKDAY[date.getDay()]}, ${day} ${LATIN_MONTH_GEN[month]}`;
  if (options.month === "long" && !options.day && !options.year) return LATIN_MONTH[month];
  if (options.hour != null || options.minute != null) {
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${day} ${LATIN_MONTH_SHORT[month]} ${year}, ${date.getHours()}:${minutes}`;
  }
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
    { id: "la", label: "Lingua Latina" },
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
      if (!code || seen.has(code)) continue;
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
