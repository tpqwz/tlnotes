import { parseImport, type Note } from "@/lib/tl/model";
import type { SearchModel } from "@/lib/tl/embed";
import { canonicalNotes, journalFingerprint, journalWriteIsSafe, mergeNotes } from "@/lib/tl/journal";
import { journalMatches, readJournal, writeJournal, writeRecords, writeSettings, writeVault, type JournalRecord } from "@/lib/tl/idb";
import { isVaultOn, noteVault, openSealed, restoreSession, sealAll, sessionKey } from "@/lib/tl/vault";
import { applyLanguage, cleanLanguageSetting } from "@/lib/tl/language";
import { rememberJournal } from "@/lib/tl/sync";
import { NativeSync, keepsFiles, nativeAndroid } from "@/lib/tl/native-sync";
import { parkNotes, materializeNotes } from "@/lib/tl/file-media";

const KEY = "tlnotes.v1";
const CENSUS = "tlnotes.census";

export type Toolbar = "float" | "strip";
export type Face = "argon" | "neon" | "xenon" | "radon" | "krypton" | "ledger" | "sans" | "plex" | "atkinson" | "josefin";
export type TypeSize = "smaller" | "small" | "regular" | "large" | "larger";
export type Theme = "journal" | "plaque" | "original" | "brutal" | "deco" | "admiralty" | "chapel" | "pocket" | "dungeon" | "tavern" | "catalog" | "blueprint" | "terminal" | "broadsheet" | "motif" | "cde" | "irix" | "turbo" | "mac";
export type Scheme = "parchment" | "original" | "night" | "press" | "deco" | "brutal" | "glass" | "classical" | "tea" | "ledger" | "admiralty" | "chapel" | "fresco" | "pocket" | "dungeon" | "tavern" | "catalog" | "blueprint" | "terminal" | "broadsheet" | "cde" | "irix" | "turbo" | "tvision" | "scp" | "scp-orange" | "scp-black" | "scp-white" | "scp-red" | "scp-grey" | "scp-yellow" | "mac";

export const FACES: Face[] = ["argon", "neon", "xenon", "radon", "krypton", "ledger", "sans", "plex", "atkinson", "josefin"];
export const TYPE_SIZES: TypeSize[] = ["smaller", "small", "regular", "large", "larger"];
export const THEMES: Theme[] = ["journal", "plaque", "original", "brutal", "deco", "admiralty", "chapel", "catalog", "blueprint", "terminal", "broadsheet", "motif", "cde", "irix", "pocket", "dungeon", "tavern", "turbo", "mac"];
export const SCHEMES: Scheme[] = ["parchment", "original", "night", "press", "deco", "brutal", "glass", "classical", "tea", "ledger", "admiralty", "chapel", "fresco", "pocket", "dungeon", "tavern", "catalog", "blueprint", "terminal", "broadsheet", "cde", "irix", "turbo", "tvision", "scp", "scp-orange", "scp-black", "scp-white", "scp-red", "scp-grey", "scp-yellow", "mac"];

export const FACE_LABEL: Record<Face, string> = {
  argon: "Argon",
  neon: "Neon",
  xenon: "Xenon",
  radon: "Radon",
  krypton: "Krypton",
  ledger: "Ledger",
  sans: "Sans",
  plex: "Plex",
  atkinson: "Atkinson",
  josefin: "Josefin",
};

export const FACE_FAMILY: Record<Face, string> = {
  argon: '"Monaspace Argon Var"',
  neon: '"Monaspace Neon Var"',
  xenon: '"Monaspace Xenon Var"',
  radon: '"Monaspace Radon Var"',
  krypton: '"Monaspace Krypton Var"',
  ledger: "Fraunces",
  sans: '"Source Sans 3"',
  plex: '"IBM Plex Mono"',
  atkinson: '"Atkinson Hyperlegible Mono"',
  josefin: '"Josefin Sans"',
};

export const TYPE_SIZE_LABEL: Record<TypeSize, string> = {
  smaller: "Smaller",
  small: "Small",
  regular: "Regular",
  large: "Large",
  larger: "Larger",
};

export const THEME_LABEL: Record<Theme | Scheme, string> = {
  journal: "Journal",
  plaque: "Plaque",
  motif: "Motif",
  parchment: "Parchment",
  original: "Original",
  night: "Night",
  press: "Press",
  deco: "Art Deco",
  brutal: "Brutal",
  glass: "Glass",
  classical: "Classical",
  tea: "Tea",
  ledger: "Ledger",
  admiralty: "Admiralty",
  chapel: "Chapel",
  fresco: "Fresco",
  pocket: "Pocket",
  dungeon: "Dungeon",
  tavern: "Tavern",
  catalog: "Catalog",
  blueprint: "Blueprint",
  terminal: "Terminal",
  broadsheet: "Broadsheet",
  cde: "CDE",
  irix: "IRIX",
  turbo: "Turbo Vision",
  tvision: "Tvision",
  scp: "SCP",
  "scp-orange": "Orange",
  "scp-black": "Black",
  "scp-white": "White",
  "scp-red": "Red",
  "scp-grey": "Grey",
  "scp-yellow": "Yellow",
  mac: "Classic Mac",
};

export const THEME_COLOR: Record<Scheme, string> = {
  parchment: "#f3efe6",
  original: "#f5f5f5",
  night: "#161410",
  press: "#f7f5f0",
  deco: "#1c140e",
  brutal: "#fffdf5",
  glass: "#f3ecda",
  classical: "#e9e2d4",
  tea: "#f3efe4",
  ledger: "#f4f7fb",
  admiralty: "#e4ebe6",
  chapel: "#1a1740",
  fresco: "#e6e1cf",
  pocket: "#9bbc0f",
  dungeon: "#0d0d1a",
  tavern: "#3a2415",
  catalog: "#5c5146",
  blueprint: "#0b3a66",
  terminal: "#031406",
  broadsheet: "#f3efe4",
  cde: "#3d7370",
  irix: "#4e74a8",
  turbo: "#bfcae3",
  tvision: "#a5a4ce",
  scp: "#bfcae3",
  "scp-orange": "#bfcae3",
  "scp-black": "#bfcae3",
  "scp-white": "#bfcae3",
  "scp-red": "#bfcae3",
  "scp-grey": "#bfcae3",
  "scp-yellow": "#bfcae3",
  mac: "#ececec",
};

export const THEME_SWATCH: Record<Scheme, { bg: string; fg: string; primary: string; border: string }> = {
  parchment: { bg: "#f3efe6", fg: "#1c1915", primary: "#1f6b4a", border: "#e4dacb" },
  original: { bg: "#f5f5f5", fg: "#333333", primary: "#4caf50", border: "#e0e0e0" },
  night: { bg: "#161410", fg: "#f3efe6", primary: "#7dcea0", border: "#3a342c" },
  press: { bg: "#f7f5f0", fg: "#111111", primary: "#111111", border: "#d9d4cc" },
  deco: { bg: "#f3eee4", fg: "#1c140e", primary: "#7a1f2b", border: "#9a7433" },
  brutal: { bg: "#fffdf5", fg: "#111111", primary: "#ffe14a", border: "#111111" },
  glass: { bg: "#f3ecda", fg: "#1a120e", primary: "#7f1d2d", border: "#b0893e" },
  classical: { bg: "#e9e2d4", fg: "#221e18", primary: "#7a2e2e", border: "#c9bfae" },
  tea: { bg: "#f3efe4", fg: "#1c1a17", primary: "#c44536", border: "#ddd6c8" },
  ledger: { bg: "#f4f7fb", fg: "#1c2b3a", primary: "#c0392b", border: "#b9cbe0" },
  admiralty: { bg: "#e4ebe6", fg: "#0e1c2f", primary: "#d6452f", border: "#1e3a5f" },
  chapel: { bg: "#1a1740", fg: "#f3e6c4", primary: "#c81e4a", border: "#c6a15b" },
  fresco: { bg: "#e6e1cf", fg: "#2c2820", primary: "#c4654a", border: "#6d8a96" },
  pocket: { bg: "#9bbc0f", fg: "#0f380f", primary: "#0f380f", border: "#306230" },
  dungeon: { bg: "#0d0d1a", fg: "#f0e6c8", primary: "#e8c547", border: "#3d3428" },
  tavern: { bg: "#3a2415", fg: "#f6e4c2", primary: "#e07040", border: "#6b4428" },
  catalog: { bg: "#5c5146", fg: "#2a2118", primary: "#b42318", border: "#c4b59a" },
  blueprint: { bg: "#0b3a66", fg: "#e7f2ff", primary: "#ffffff", border: "#7eb6e6" },
  terminal: { bg: "#031406", fg: "#7cff6b", primary: "#b6ff9a", border: "#1f6b32" },
  broadsheet: { bg: "#f3efe4", fg: "#1a1a1a", primary: "#1a1a1a", border: "#1a1a1a" },
  cde: { bg: "#3d7370", fg: "#1a1a1a", primary: "#0b5c5a", border: "#d5d0c6" },
  irix: { bg: "#4e74a8", fg: "#121212", primary: "#16386a", border: "#c8c8c8" },
  turbo: { bg: "#bfcae3", fg: "#000000", primary: "#0000aa", border: "#ffffff" },
  tvision: { bg: "#a5a4ce", fg: "#000000", primary: "#0000ff", border: "#ffffff" },
  scp: { bg: "#bfcae3", fg: "#000000", primary: "#840603", border: "#64bec4" },
  "scp-orange": { bg: "#e39814", fg: "#000000", primary: "#840603", border: "#ffffff" },
  "scp-black": { bg: "#000000", fg: "#ffffff", primary: "#11ff00", border: "#ffffff" },
  "scp-white": { bg: "#ffffff", fg: "#000000", primary: "#840603", border: "#bfcae3" },
  "scp-red": { bg: "#840603", fg: "#ffffff", primary: "#11ff00", border: "#ffffff" },
  "scp-grey": { bg: "#bdbdbd", fg: "#000000", primary: "#840603", border: "#ffffff" },
  "scp-yellow": { bg: "#bfcc2b", fg: "#000000", primary: "#840603", border: "#ffffff" },
  mac: { bg: "#b7c0ce", fg: "#000000", primary: "#6a6ac8", border: "#ffffff" },
};

export type Rule = 1 | 2 | 3;

export const RULES: Rule[] = [1, 2, 3];

export const RULE_LABEL: Record<Rule, string> = {
  1: "Fine",
  2: "Even",
  3: "Strong",
};

export type Settings = {
  rightHanded: boolean;
  scopeCollapsed: boolean;
  scrollTop: number;
  toolbar: Toolbar;
  rule: Rule;
  face: Face;
  typeSize: TypeSize;
  theme: Theme;
  scheme: Scheme;
  searchModel: SearchModel;
  searchStem: boolean;
  searchFuzzy: boolean;
  searchMeaning: boolean;
  language: string;
  revised: number;
  /** A share opens the editor. When false, it is added like a line typed in the box. */
  shareEdit: boolean;
  /** Fetch and show a picture and title for a link. The address stays either way. */
  linkPreviews: boolean;
  /** Return adds the note. When false, Shift+Return adds it and Return starts a new line. */
  enterSends: boolean;
  /** On Android, look at the website for a newer package. Off leaves this package as it is. */
  pagePackage: boolean;
};

export type Persisted = {
  notes: Note[];
  trash: Note[];
  settings: Settings;
};

export const defaultSettings = (): Settings => ({
  rightHanded: true,
  scopeCollapsed: false,
  scrollTop: 0,
  toolbar: "float",
  rule: 2,
  face: "argon",
  typeSize: "small",
  theme: "plaque",
  scheme: "parchment",
  searchModel: "off",
  searchStem: false,
  searchFuzzy: false,
  searchMeaning: false,
  language: "system",
  revised: 0,
  shareEdit: true,
  linkPreviews: true,
  enterSends: false,
  pagePackage: false,
});

const LEGACY_LOOK: Record<string, [Theme, Scheme]> = {
  parchment: ["journal", "parchment"],
  night: ["journal", "night"],
  press: ["journal", "press"],
  glass: ["journal", "glass"],
  classical: ["journal", "classical"],
  tea: ["journal", "tea"],
  ledger: ["journal", "ledger"],
  fresco: ["journal", "fresco"],
  cde: ["motif", "cde"],
  irix: ["motif", "irix"],
};

export function resolveLook(theme: string | undefined, scheme: string | undefined): { theme: Theme; scheme: Scheme } {
  let nextTheme = theme;
  let nextScheme = scheme;
  if (!nextTheme || !THEMES.includes(nextTheme as Theme)) {
    const pair = nextTheme ? LEGACY_LOOK[nextTheme] : undefined;
    nextTheme = pair ? pair[0] : "plaque";
    if ((!nextScheme || !SCHEMES.includes(nextScheme as Scheme)) && pair) nextScheme = pair[1];
  }
  if (!nextScheme || !SCHEMES.includes(nextScheme as Scheme)) {
    nextScheme = SCHEMES.includes(nextTheme as Scheme) ? nextTheme : "parchment";
  }
  return { theme: nextTheme as Theme, scheme: nextScheme as Scheme };
}

export const NATIVE_SCHEME: Record<Theme, Scheme> = {
  journal: "parchment",
  plaque: "parchment",
  original: "original",
  brutal: "brutal",
  deco: "deco",
  admiralty: "admiralty",
  chapel: "chapel",
  pocket: "pocket",
  dungeon: "dungeon",
  tavern: "tavern",
  catalog: "catalog",
  blueprint: "blueprint",
  terminal: "terminal",
  broadsheet: "broadsheet",
  motif: "cde",
  cde: "cde",
  irix: "irix",
  turbo: "turbo",
  mac: "mac",
};

export function applyType(settings: Pick<Settings, "face" | "typeSize"> & Partial<Pick<Settings, "language" | "theme" | "scheme" | "rule" | "linkPreviews">>) {
  if (typeof document === "undefined") {
    applyLanguage(settings.language);
    return;
  }
  const look = resolveLook(settings.theme, settings.scheme);
  const rule = settings.rule === 1 || settings.rule === 2 || settings.rule === 3 ? settings.rule : 2;
  document.documentElement.dataset.face = settings.face;
  document.documentElement.dataset.size = settings.typeSize;
  document.documentElement.dataset.theme = look.theme;
  document.documentElement.dataset.scheme = look.scheme;
  document.documentElement.style.setProperty("--rule", `${rule}px`);
  document.documentElement.dataset.previews = settings.linkPreviews === false ? "off" : "on";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[look.scheme]);
  applyLanguage(settings.language);
}

/** Runs before paint so a saved face does not flash, and so Android Back has a history entry to consume. */
export const TYPE_BOOT =
  '(function(){try{var s=JSON.parse(localStorage.getItem("tlnotes.v1")||"{}").settings||{};var faces={argon:1,neon:1,xenon:1,radon:1,krypton:1,ledger:1,sans:1,plex:1,atkinson:1,josefin:1};var sizes={smaller:1,small:1,regular:1,large:1,larger:1};var schemes={parchment:"#f3efe6",original:"#f5f5f5",night:"#161410",press:"#f7f5f0",deco:"#1c140e",brutal:"#fffdf5",glass:"#f3ecda",classical:"#e9e2d4",tea:"#f3efe4",ledger:"#f4f7fb",admiralty:"#e4ebe6",chapel:"#1a1740",fresco:"#e6e1cf",pocket:"#9bbc0f",dungeon:"#0d0d1a",tavern:"#3a2415",catalog:"#5c5146",blueprint:"#0b3a66",terminal:"#031406",broadsheet:"#f3efe4",cde:"#3d7370",irix:"#4e74a8",turbo:"#bfcae3",tvision:"#a5a4ce",scp:"#bfcae3","scp-orange":"#bfcae3","scp-black":"#bfcae3","scp-white":"#bfcae3","scp-red":"#bfcae3","scp-grey":"#bfcae3","scp-yellow":"#bfcae3",mac:"#ececec"};var frames={journal:1,plaque:1,original:1,brutal:1,deco:1,admiralty:1,chapel:1,pocket:1,dungeon:1,tavern:1,catalog:1,blueprint:1,terminal:1,broadsheet:1,motif:1,turbo:1,mac:1};var legacy={parchment:["journal","parchment"],night:["journal","night"],press:["journal","press"],glass:["journal","glass"],classical:["journal","classical"],tea:["journal","tea"],ledger:["journal","ledger"],fresco:["journal","fresco"],cde:["motif","cde"],irix:["motif","irix"]};if(faces[s.face])document.documentElement.dataset.face=s.face;document.documentElement.dataset.size=sizes[s.typeSize]?s.typeSize:"small";if(s.rule===1||s.rule===2||s.rule===3)document.documentElement.style.setProperty("--rule",s.rule+"px");var theme=s.theme,scheme=s.scheme;if(theme==="bauhaus"||!frames[theme]){var pair=legacy[theme]||["plaque","parchment"];theme=pair[0];if(!schemes[scheme])scheme=pair[1];}if(!schemes[scheme])scheme=schemes[theme]?theme:"parchment";document.documentElement.dataset.theme=theme;document.documentElement.dataset.scheme=scheme;var m=document.querySelector(\'meta[name="theme-color"]\');if(m)m.setAttribute("content",schemes[scheme]);}catch(e){}try{if(window.parent!==window)return;function pack(extra){var base=history.state&&typeof history.state==="object"?history.state:{};return Object.assign({},base,extra,{tlReady:true,tlGuard:true});}if(!(history.state&&history.state.tlGuard))history.pushState(pack({tlFloor:false}),"");window.addEventListener("popstate",function(){var now=history.state&&typeof history.state==="object"?history.state:null;if(!now||now.tlFloor||!now.tlGuard)history.pushState(pack({tlFloor:false}),"");},true);window.addEventListener("pageshow",function(){var now=history.state&&typeof history.state==="object"?history.state:null;if(!now||!now.tlGuard)history.pushState(pack({tlFloor:false}),"");});}catch(e){}})();';

export function normalizeSettings(settings: Partial<Settings> | null | undefined): Settings {
  const face = settings?.face && FACES.includes(settings.face) ? settings.face : "argon";
  const typeSize = settings?.typeSize && TYPE_SIZES.includes(settings.typeSize) ? settings.typeSize : "small";
  const look = resolveLook(settings?.theme, settings?.scheme);
  const searchModel = settings?.searchModel === "e5" || settings?.searchModel === "gemma" ? settings.searchModel : "off";
  return {
    rightHanded: settings?.rightHanded !== false,
    scopeCollapsed: settings?.scopeCollapsed === true,
    scrollTop: typeof settings?.scrollTop === "number" ? settings.scrollTop : 0,
    toolbar: settings?.toolbar === "strip" ? "strip" : "float",
    rule: settings?.rule === 1 || settings?.rule === 3 ? settings.rule : 2,
    face,
    typeSize,
    theme: look.theme,
    scheme: look.scheme,
    searchModel,
    searchStem: settings?.searchStem === true,
    searchFuzzy: settings?.searchFuzzy === true,
    searchMeaning: settings?.searchMeaning === true,
    language: cleanLanguageSetting(settings?.language),
    revised: typeof settings?.revised === "number" && Number.isFinite(settings.revised) ? settings.revised : 0,
    shareEdit: settings?.shareEdit !== false,
    linkPreviews: settings?.linkPreviews !== false,
    enterSends: settings?.enterSends === true,
    pagePackage: settings?.pagePackage === true,
  };
}

/** The later copy wins. When neither was stamped, a choice kept only in the local mirror is not thrown away. */
export function chooseSettings(stored: Partial<Settings> | null | undefined, local: Partial<Settings> | null | undefined): Settings {
  const saved = stored ? normalizeSettings(stored) : null;
  const mirror = local ? normalizeSettings(local) : null;
  if (!saved) return mirror ?? defaultSettings();
  if (!mirror) return saved;
  if (mirror.revised !== saved.revised) return mirror.revised > saved.revised ? mirror : saved;
  const base = defaultSettings();
  return {
    ...saved,
    rightHanded: saved.rightHanded === base.rightHanded ? mirror.rightHanded : saved.rightHanded,
    scopeCollapsed: saved.scopeCollapsed === base.scopeCollapsed ? mirror.scopeCollapsed : saved.scopeCollapsed,
    toolbar: saved.toolbar === base.toolbar ? mirror.toolbar : saved.toolbar,
    rule: saved.rule === base.rule ? mirror.rule : saved.rule,
    face: saved.face === base.face ? mirror.face : saved.face,
    typeSize: saved.typeSize === base.typeSize ? mirror.typeSize : saved.typeSize,
    theme: saved.theme === base.theme ? mirror.theme : saved.theme,
    scheme: saved.scheme === base.scheme ? mirror.scheme : saved.scheme,
    searchModel: saved.searchModel === base.searchModel ? mirror.searchModel : saved.searchModel,
    searchStem: saved.searchStem === base.searchStem ? mirror.searchStem : saved.searchStem,
    searchFuzzy: saved.searchFuzzy === base.searchFuzzy ? mirror.searchFuzzy : saved.searchFuzzy,
    searchMeaning: saved.searchMeaning === base.searchMeaning ? mirror.searchMeaning : saved.searchMeaning,
    language: saved.language === base.language ? mirror.language : saved.language,
    shareEdit: saved.shareEdit === base.shareEdit ? mirror.shareEdit : saved.shareEdit,
    linkPreviews: saved.linkPreviews === base.linkPreviews ? mirror.linkPreviews : saved.linkPreviews,
    enterSends: saved.enterSends === base.enterSends ? mirror.enterSends : saved.enterSends,
    pagePackage: saved.pagePackage === base.pagePackage ? mirror.pagePackage : saved.pagePackage,
  };
}

function migrateLegacy(): Persisted | null {
  try {
    const oldNotes = localStorage.getItem("tlnotes");
    const oldTrash = localStorage.getItem("tlnotes-trash");
    if (!oldNotes && !oldTrash) return null;
    const parsed = parseImport({
      notes: oldNotes ? JSON.parse(oldNotes) : [],
      trash: oldTrash ? JSON.parse(oldTrash) : [],
    });
    if (!parsed) return null;
    return { ...parsed, settings: defaultSettings() };
  } catch {
    return null;
  }
}

function emptyStore(): Persisted {
  return { notes: [], trash: [], settings: defaultSettings() };
}

function readCensus() {
  try {
    const raw = localStorage.getItem(CENSUS);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { n?: number };
    return typeof parsed.n === "number" && parsed.n > 0 ? parsed.n : 0;
  } catch {
    return 0;
  }
}

function markCensus(count: number) {
  try {
    localStorage.setItem(CENSUS, JSON.stringify({ n: count, at: Date.now() }));
  } catch {
    /* the mark is a guard, not the journal */
  }
}

function askToKeep() {
  const storage = navigator.storage;
  if (!storage?.persist) return;
  void storage.persist().catch(() => undefined);
}

function readLocal(): Persisted | null {
  try {
    const raw = localStorage.getItem(KEY);
    const legacy = migrateLegacy();
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Persisted>;
      const notes = Array.isArray(parsed.notes) ? parsed.notes : [];
      const trash = Array.isArray(parsed.trash) ? parsed.trash : [];
      const imported = parseImport({ notes, trash }) ?? { notes: [], trash: [] };
      if (imported.notes.length === 0 && imported.trash.length === 0 && legacy && (legacy.notes.length > 0 || legacy.trash.length > 0)) {
        return { notes: legacy.notes, trash: legacy.trash, settings: normalizeSettings(parsed.settings ?? legacy.settings) };
      }
      return { notes: imported.notes, trash: imported.trash, settings: normalizeSettings(parsed.settings) };
    }
    return legacy;
  } catch {
    return null;
  }
}

export function loadPersisted(): Persisted {
  return readLocal() ?? emptyStore();
}

function dropStoredFile(note: Note): Note {
  if (keepsFiles()) return note;
  let copy = note;
  if (note.image?.startsWith("data:")) {
    copy = { ...copy };
    delete copy.image;
  }
  if (note.video?.startsWith("data:")) {
    if (copy === note) copy = { ...copy };
    delete copy.video;
  }
  if (note.preview?.image?.startsWith("data:")) {
    if (copy === note) copy = { ...copy };
    const preview = { ...note.preview };
    delete preview.image;
    copy.preview = preview;
  }
  return copy;
}

function fitCopy(data: Persisted): Persisted {
  if (keepsFiles()) return data;
  const notes = data.notes.map(dropStoredFile);
  const trash = data.trash.map(dropStoredFile);
  if (notes.every((note, index) => note === data.notes[index]) && trash.every((note, index) => note === data.trash[index])) return data;
  return { ...data, notes, trash };
}

function lightNotes(notes: Note[]): Note[] {
  return notes.map((note) => {
    let copy = note;
    if (note.image?.startsWith("data:")) {
      copy = { ...copy };
      delete copy.image;
    }
    if (note.video?.startsWith("data:")) {
      if (copy === note) copy = { ...note };
      delete copy.video;
    }
    if (note.preview?.image?.startsWith("data:")) {
      if (copy === note) copy = { ...note };
      const preview = { ...note.preview };
      delete preview.image;
      copy.preview = preview;
    }
    return copy;
  });
}

function rememberLegacyCopied() {
  try {
    localStorage.removeItem("tlnotes");
    localStorage.removeItem("tlnotes-trash");
  } catch {
    /* the old keys can stay until a later copy succeeds */
  }
}

/** Notes used to live here. IndexedDB is faster, but a phone can open it empty. This copy is what comes back. */
function keepJournalLocal(data: Persisted, replace = false) {
  if (isVaultOn()) {
    keepSettingsLocal(data.settings);
    return;
  }
  const existing = readLocal();
  const storedIds = [...(existing?.notes ?? []), ...(existing?.trash ?? [])].map((note) => note.id);
  const nextIds = [...data.notes, ...data.trash].map((note) => note.id);
  if (existing && !journalWriteIsSafe(storedIds, nextIds, replace)) return;
  const settings = data.settings;
  try {
    localStorage.setItem(KEY, JSON.stringify({ notes: data.notes, trash: data.trash, settings }));
    rememberLegacyCopied();
    return;
  } catch {
    /* the pictures did not fit */
  }
  try {
    localStorage.setItem(KEY, JSON.stringify({ notes: lightNotes(data.notes), trash: lightNotes(data.trash), settings }));
    rememberLegacyCopied();
    return;
  } catch {
    /* leave the previous copy, which may still hold the notes */
  }
  if (existing && (existing.notes.length > 0 || existing.trash.length > 0)) return;
  keepSettingsLocal(settings);
}

function keepSettingsLocal(settings: Settings) {
  const existing = readLocal();
  if (!isVaultOn() && existing && (existing.notes.length > 0 || existing.trash.length > 0)) {
    keepJournalLocal({ notes: existing.notes, trash: existing.trash, settings });
    return;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify({ settings }));
  } catch {
    /* a settings copy must not erase a journal that did not fit */
  }
}

let backend: "idb" | "local" = "local";
let removed: Record<string, number> = {};
let savedBody = "";
let chain: Promise<void> = Promise.resolve();
let queued: Persisted | null = null;
let warned = false;
let blocked = false;
let loud = false;
let replaceNext = false;
let report = (_message: string) => {};

export function onPersistError(fn: (message: string) => void) {
  report = fn;
}

function storageFull(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  if (name === "QuotaExceededError" || name === "QuotaExceeded") return true;
  const message = "message" in error ? String(error.message) : "";
  return /quota/i.test(message);
}

function explain(error: unknown) {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  if (message.startsWith("The open journal")) return message;
  if (storageFull(error)) return "This device is full. Export a backup before the latest change is lost.";
  return "The latest change is on screen, but it is not stored yet.";
}

function tell(error: unknown) {
  blocked = true;
  if (warned || !loud) return;
  warned = true;
  report(explain(error));
}

export function persistHealthy() {
  return !blocked;
}

function rememberBody(notes: Note[], trash: Note[]) {
  savedBody = journalFingerprint(canonicalNotes(notes, trash));
}

async function flush() {
  const incoming = queued;
  if (!incoming || backend !== "idb") return;
  queued = null;
  const replacing = replaceNext;
  replaceNext = false;
  const parked = keepsFiles() && !isVaultOn();
  const data = parked ? { ...incoming, notes: await parkNotes(incoming.notes), trash: await parkNotes(incoming.trash) } : incoming;
  if (parked) {
    try {
      keepJournalLocal(data, replacing);
    } catch {
      /* the journal itself is in IndexedDB */
    }
  }
  const body = journalFingerprint(canonicalNotes(data.notes, data.trash));
  const notesChanged = body !== savedBody;
  try {
    const key = sessionKey();
    if (isVaultOn()) {
      if (!key) await writeSettings(data.settings);
      else if (notesChanged) removed = await writeRecords(await sealAll(data.notes, data.trash, key), data.settings, removed, true, replacing);
      else await writeSettings(data.settings);
    } else if (notesChanged) removed = await writeJournal(data.notes, data.trash, data.settings, removed, true, replacing);
    else await writeSettings(data.settings);
    savedBody = body;
    if (notesChanged) {
      markCensus(data.notes.length + data.trash.length);
      const shared = parked ? { notes: await materializeNotes(data.notes), trash: await materializeNotes(data.trash) } : data;
      rememberJournal(shared.notes, shared.trash, removed);
    }
    warned = false;
    blocked = false;
    loud = false;
  } catch (error) {
    tell(error);
  }
  if (queued) await flush();
}

export function journalRemoved() {
  return removed;
}

export function whenSaved() {
  return chain.then(() => undefined);
}

export function savePersisted(data: Persisted, quiet = false, replace = false) {
  const next = fitCopy({ ...data, settings: { ...data.settings, revised: Date.now() } });
  if (!quiet) loud = true;
  if (replace) replaceNext = true;
  if (backend !== "idb") {
    replaceNext = false;
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      warned = false;
      blocked = false;
      loud = false;
    } catch (error) {
      tell(error);
    }
    return;
  }
  try {
    if (!keepsFiles() || isVaultOn()) keepJournalLocal(next, replace);
  } catch {
    /* the journal itself is in IndexedDB */
  }
  queued = next;
  chain = chain.then(flush).catch(() => undefined);
}

function fromRecord(record: JournalRecord, fallback: Settings): Persisted {
  return {
    notes: record.notes,
    trash: record.trash,
    settings: normalizeSettings(record.settings ?? fallback),
  };
}

export async function openJournal(): Promise<{ data: Persisted; hadStore: boolean; locked: boolean; missing: boolean }> {
  const hadLocal =
    localStorage.getItem(KEY) != null ||
    localStorage.getItem("tlnotes") != null ||
    localStorage.getItem("tlnotes-trash") != null;
  const local = readLocal();
  const census = readCensus();
  try {
    const record = await readJournal();
    if (record.vault && record.sealed.length === 0 && (record.notes.length > 0 || record.trash.length > 0)) {
      await writeVault(null);
      record.vault = null;
    }
    noteVault(record.vault);
    const idbCount = record.notes.length + record.trash.length + record.sealed.length;
    if (!record.ready && idbCount === 0) {
      if (census > 0 && !(local && (local.notes.length > 0 || local.trash.length > 0))) {
        backend = "idb";
        return {
          data: { notes: [], trash: [], settings: chooseSettings(record.settings, local?.settings) },
          hadStore: true,
          locked: false,
          missing: true,
        };
      }
      const source = fitCopy(local ?? emptyStore());
      removed = {};
      await writeJournal(source.notes, source.trash, source.settings, {}, false);
      if (!(await journalMatches(source.notes, source.trash))) {
        backend = "local";
        return { data: source, hadStore: hadLocal, locked: false, missing: false };
      }
      await writeJournal(source.notes, source.trash, source.settings, {}, true);
      keepJournalLocal(source);
      backend = "idb";
      rememberBody(source.notes, source.trash);
      markCensus(source.notes.length + source.trash.length);
      askToKeep();
      return { data: source, hadStore: hadLocal || source.notes.length > 0 || source.trash.length > 0, locked: false, missing: false };
    }
    if (record.ready && idbCount === 0 && census > 0 && !(local && (local.notes.length > 0 || local.trash.length > 0))) {
      backend = "idb";
      return {
        data: { notes: [], trash: [], settings: chooseSettings(record.settings, local?.settings) },
        hadStore: true,
        locked: false,
        missing: true,
      };
    }
    if (record.vault) {
      removed = record.removed;
      const settings = chooseSettings(record.settings, local?.settings);
      backend = "idb";
      if (await restoreSession()) {
        const key = sessionKey();
        if (key) {
          const opened = await Promise.all(record.sealed.map((item) => openSealed(item, key)));
          const parsed = parseImport({ notes: opened, trash: [] }) ?? { notes: [], trash: [] };
          const data = { notes: parsed.notes, trash: parsed.trash, settings };
          rememberBody(data.notes, data.trash);
          markCensus(data.notes.length + data.trash.length);
          askToKeep();
          return { data, hadStore: true, locked: false, missing: false };
        }
      }
      markCensus(record.sealed.length);
      return { data: { notes: [], trash: [], settings }, hadStore: true, locked: true, missing: false };
    }
    removed = record.removed;
    const settings = chooseSettings(record.settings, local?.settings);
    let data = { ...fromRecord(record, settings), settings };
    if (local && (local.notes.length > 0 || local.trash.length > 0)) {
      const merged = mergeNotes([...data.notes, ...data.trash], [...local.notes, ...local.trash], removed);
      if (merged.changed) {
        const parsed = parseImport({ notes: merged.notes, trash: [] }) ?? { notes: data.notes, trash: data.trash };
        data = { notes: parsed.notes, trash: parsed.trash, settings };
        removed = await writeJournal(data.notes, data.trash, data.settings, removed);
      }
    }
    if (JSON.stringify(normalizeSettings(record.settings)) !== JSON.stringify(settings)) {
      try {
        await writeSettings(settings);
      } catch {
        /* the journal is already open */
      }
    }
    keepJournalLocal(data);
    backend = "idb";
    const fitted = fitCopy(data);
    if (fitted !== data) {
      data = fitted;
      removed = await writeJournal(data.notes, data.trash, data.settings, removed);
      keepJournalLocal(data);
    }
    rememberBody(data.notes, data.trash);
    markCensus(data.notes.length + data.trash.length);
    askToKeep();
    return { data, hadStore: true, locked: false, missing: false };
  } catch {
    backend = "local";
    noteVault(null);
    const data = local ?? emptyStore();
    const missing = census > 0 && data.notes.length === 0 && data.trash.length === 0;
    return { data, hadStore: hadLocal || missing, locked: false, missing };
  }
}

export async function acceptUnlocked(opened: Note[], settings: Settings): Promise<Persisted> {
  const parsed = parseImport({ notes: opened, trash: [] }) ?? { notes: [], trash: [] };
  let data: Persisted = { notes: parsed.notes, trash: parsed.trash, settings: normalizeSettings(settings) };
  const local = readLocal();
  if (local && (local.notes.length > 0 || local.trash.length > 0)) {
    const merged = mergeNotes([...data.notes, ...data.trash], [...local.notes, ...local.trash], removed);
    if (merged.changed) {
      const again = parseImport({ notes: merged.notes, trash: [] }) ?? parsed;
      data = { notes: again.notes, trash: again.trash, settings: data.settings };
    }
    keepJournalLocal(data);
  }
  const key = sessionKey();
  data = fitCopy(data);
  if (key) removed = await writeRecords(await sealAll(data.notes, data.trash, key), data.settings, removed);
  backend = "idb";
  rememberBody(data.notes, data.trash);
  return data;
}

export function exportPayload(notes: Note[], trash: Note[]) {
  return {
    notes,
    trash,
    exportDate: new Date().toISOString(),
    version: 1,
  };
}

export type SaveResult = "saved" | "cancelled" | "blocked";

function framed() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function extensionOf(filename: string) {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot) : "";
}

function cancelled(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function saveWithPicker(filename: string, text: string, type: string): Promise<SaveResult> {
  const picker = (window as Window & { showSaveFilePicker?: (options: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
  if (typeof picker !== "function") return saveLoose(filename, text, type);
  const extension = extensionOf(filename);
  try {
    const handle = await picker({
      suggestedName: filename,
      types: extension ? [{ description: "TLNotes", accept: { [type]: [extension] } }] : undefined,
    });
    const writable = await handle.createWritable();
    await writable.write(new Blob([text], { type }));
    await writable.close();
    return "saved";
  } catch (error) {
    if (cancelled(error)) return "cancelled";
    return saveLoose(filename, text, type);
  }
}

async function saveLoose(filename: string, text: string, type: string): Promise<SaveResult> {
  const file = new File([text], filename, { type });
  if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return "saved";
    } catch (error) {
      if (cancelled(error)) return "cancelled";
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "saved";
}

function saveInWindow(filename: string, text: string, type: string): Promise<SaveResult> {
  const child = window.open("", "tlnotes-export", "popup=yes,width=420,height=320");
  if (!child) return Promise.resolve("blocked");
  const extension = extensionOf(filename);
  const page = `<!doctype html><meta charset="utf-8"><title>${escapeHtml(filename)}</title>
<body style="font:16px/1.4 sans-serif;padding:24px;color:#1c140e;background:#f3efe6">
<p>Save <strong id="name"></strong></p>
<p><button id="save" type="button" style="font:inherit;padding:8px 14px">Save file</button></p>
<p id="status" style="color:#5c5146"></p>
<script>
const expected = ${JSON.stringify(window.location.origin)};
let payload = null;
window.addEventListener("message", (event) => {
  if (event.origin !== expected || !event.data || event.data.tlExport !== true) return;
  payload = event.data;
  document.getElementById("name").textContent = payload.filename;
});
document.getElementById("save").addEventListener("click", async () => {
  if (!payload) return;
  const blob = new Blob([payload.text], { type: payload.type });
  const status = document.getElementById("status");
  try {
    if (typeof showSaveFilePicker === "function") {
      const handle = await showSaveFilePicker({
        suggestedName: payload.filename,
        types: payload.extension ? [{ description: "TLNotes", accept: { [payload.type]: [payload.extension] } }] : undefined,
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      window.opener?.postMessage({ tlExportResult: "saved" }, expected);
      window.close();
      return;
    }
  } catch (error) {
    if (error && error.name === "AbortError") return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = payload.filename;
  link.click();
  status.textContent = "If the file did not download, the browser blocked it.";
  window.opener?.postMessage({ tlExportResult: "saved" }, expected);
});
</script></body>`;
  child.document.open();
  child.document.write(page);
  child.document.close();
  child.postMessage({ tlExport: true, filename, text, type, extension }, window.location.origin);
  return new Promise((resolve) => {
    const finish = (event: MessageEvent) => {
      if (event.source !== child || event.data?.tlExportResult !== "saved") return;
      window.removeEventListener("message", finish);
      resolve("saved");
    };
    window.addEventListener("message", finish);
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (mark) => {
    if (mark === "&") return "&" + "amp;";
    if (mark === "<") return "&" + "lt;";
    if (mark === ">") return "&" + "gt;";
    if (mark === '"') return "&" + "quot;";
    return "&" + "#39;";
  });
}

export function downloadText(filename: string, text: string, type: string): Promise<SaveResult> {
  if (typeof window === "undefined") return Promise.resolve("blocked");
  if (nativeAndroid()) return saveOnAndroid(filename, text, type);
  if (framed()) return saveInWindow(filename, text, type);
  if (typeof (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker === "function") {
    return saveWithPicker(filename, text, type);
  }
  return saveLoose(filename, text, type);
}

function saveOnAndroid(filename: string, text: string, type: string): Promise<SaveResult> {
  return NativeSync.save({ filename, text, type }).then(
    (result) => (result?.cancelled || !result?.name ? "cancelled" : "saved"),
    () => "blocked",
  );
}

export function downloadJson(filename: string, data: unknown) {
  return downloadText(filename, JSON.stringify(data, null, 2), "application/json");
}

export function exportFilename() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `tlnotes-${now.getFullYear()}-${month}-${day}.json`;
}
