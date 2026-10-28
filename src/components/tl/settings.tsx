import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Download, Trash2, Upload } from "lucide-react";
import { formatBytes, typeLabel, type Note } from "@/lib/tl/model";
import { FACE_FAMILY, FACE_LABEL, FACES, NATIVE_SCHEME, RULE_LABEL, RULES, SCHEMES, THEME_LABEL, THEME_SWATCH, THEMES, TYPE_SIZE_LABEL, TYPE_SIZES, type Face, type Rule, type Scheme, type Settings, type Theme, type TypeSize } from "@/lib/tl/storage";
import { languageChoices, languageName, systemLanguage } from "@/lib/tl/language";
import { t, tLine } from "@/lib/tl/i18n";
import { chooseModel, embedStatus, subscribeEmbed, type EmbedStatus, type SearchModel } from "@/lib/tl/embed";
import { SealSection } from "@/components/tl/vault";
import { applyUpdate, checkForUpdate, getPwaSnapshot, promptInstall, subscribePwa } from "@/lib/tl/pwa";
import { chooseSyncFile, forgetSyncFile, subscribeSync, syncSnapshot } from "@/lib/tl/sync";
import { nativeApp, nativeSync } from "@/lib/tl/native-sync";
import { btnGhost, btnInk, btnPrimary, btnSurface, InfoButton } from "@/components/tl/ui";

export function SettingsView({
  notes,
  trash,
  rightHanded,
  onExport,
  onExportCalendar,
  onImport,
  onClear,
  onViewTrash,
  onRestoreAll,
  onEmptyTrash,
  onToggleHand,
  toolbar,
  onToggleToolbar,
  rule,
  onRule,
  face,
  typeSize,
  theme,
  scheme,
  language,
  onLanguage,
  onFace,
  onTheme,
  onScheme,
  onTypeSize,
  searchModel,
  onSearchModel,
  shareEdit,
  onShareEdit,
  linkPreviews,
  onLinkPreviews,
  enterSends,
  onEnterSends,
  onSample,
  sealed,
  passkey,
  onSeal,
  onUnseal,
  onChangePassphrase,
  onNewRecovery,
  onEnrollDevice,
  onRemoveDevice,
  onLock,
}: {
  notes: Note[];
  trash: Note[];
  rightHanded: boolean;
  onExport: () => void;
  onExportCalendar: () => void;
  onImport: () => void;
  onClear: () => void;
  onViewTrash: () => void;
  onRestoreAll: () => void;
  onEmptyTrash: () => void;
  onToggleHand: () => void;
  toolbar: "float" | "strip";
  onToggleToolbar: () => void;
  rule: Rule;
  onRule: (rule: Rule) => void;
  face: Face;
  typeSize: TypeSize;
  theme: Theme;
  scheme: Scheme;
  language: string;
  onLanguage: (language: string) => void;
  onFace: (face: Face) => void;
  onTheme: (theme: Theme) => void;
  onScheme: (scheme: Scheme) => void;
  onTypeSize: (size: TypeSize) => void;
  searchModel: Settings["searchModel"];
  onSearchModel: (model: SearchModel) => void;
  shareEdit: boolean;
  onShareEdit: (shareEdit: boolean) => void;
  linkPreviews: boolean;
  onLinkPreviews: (linkPreviews: boolean) => void;
  enterSends: boolean;
  onEnterSends: (enterSends: boolean) => void;
  onSample: () => void;
  sealed: boolean;
  passkey: boolean;
  onSeal: (passphrase: string) => Promise<string>;
  onUnseal: () => Promise<void>;
  onChangePassphrase: (passphrase: string) => Promise<void>;
  onNewRecovery: () => Promise<string>;
  onEnrollDevice: () => Promise<void>;
  onRemoveDevice: () => Promise<void>;
  onLock: () => Promise<void>;
}) {
  const pwa = useSyncExternalStore(subscribePwa, getPwaSnapshot, getPwaSnapshot);
  const sync = useSyncExternalStore(subscribeSync, syncSnapshot, syncSnapshot);
  const embed = useSyncExternalStore(subscribeEmbed, embedStatus, embedStatus);
  const showSync = nativeSync();
  const showShare = nativeApp();
  const sections = CONTENTS.filter((item) => (item.id !== "settings-sync" || showSync) && (item.id !== "settings-sharing" || showShare));
  const bytes = new Blob([JSON.stringify({ notes, trash })]).size;
  const pictures = pictureStats([...notes, ...trash]);
  const room = useAllowance();
  const byType = notes.reduce<Record<string, number>>((counts, note) => {
    counts[note.type] = (counts[note.type] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <div className={`settings-page pb-8${toolbar === "float" ? (rightHanded ? " settings-clear-right" : " settings-clear-left") : ""}`}>
      <nav aria-label={t("On this page")} className="sticky top-0 z-10 flex gap-x-3 overflow-x-auto border-b border-border bg-bg py-2 text-sm whitespace-nowrap">
        {sections.map((item) => (
          <button key={item.id} type="button" className="text-fg hover:text-primary" onClick={() => openSection(item.id)}>
            {t(item.title)}
          </button>
        ))}
      </nav>
      <Section
        id="settings-data"
        title="Data"
        about="JSON is a full backup, including the trash and any picture kept on a page. The SQLite graph is rebuilt from these notes whenever it is asked a question. It is not a second copy, and export does not save it. A calendar file is the iCalendar standard: events, dated tasks, and periods."
      >
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} onClick={onExport}>
            <Download className="size-4" />
            {t("Export JSON")}
          </button>
          <button type="button" className={btnSurface} onClick={onExportCalendar}>
            <Download className="size-4" />
            {t("Export calendar")}
          </button>
          <button type="button" className={btnSurface} onClick={onImport}>
            <Upload className="size-4" />
            {t("Import")}
          </button>
          <button type="button" className={btnInk} onClick={onClear}>
            {t("Clear all")}
          </button>
        </div>
      </Section>

      {showSync ? (
      <Section
        id="settings-sync"
        title="Sync"
        about="Choose a file this app can keep open, including one in a folder that already syncs, such as Syncthing. The permission stays, so the file is read and written on its own. The newer note is kept. A deletion travels too. The layout stays on this device. A sealed journal is not written there. Unseal on both devices, then seal again after."
      >
        <p className="text-sm text-pretty text-muted">{tLine(sync.detail)}</p>
        {sync.supported ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} onClick={() => void chooseSyncFile(false)}>
              {t("Use a sync file")}
            </button>
            <button type="button" className={btnSurface} onClick={() => void chooseSyncFile(true)}>
              {t("New sync file")}
            </button>
            {sync.name ? (
              <button type="button" className={btnInk} onClick={() => void forgetSyncFile()}>
                {t("Stop syncing")}
              </button>
            ) : null}
          </div>
        ) : null}
      </Section>
      ) : null}

      <Section id="settings-app" title="App" about={appStatus(pwa)}>
        <div className="flex flex-wrap gap-2">
          {pwa.canInstall && (
            <button type="button" className={btnPrimary} onClick={() => void promptInstall()}>
              {t("Install TLNotes")}
            </button>
          )}
          {pwa.update === "ready" ? (
            <button type="button" className={btnPrimary} onClick={() => void applyUpdate()}>
              {t("Update now")}
            </button>
          ) : (
            pwa.update !== "unsupported" && (
              <button type="button" className={btnSurface} disabled={pwa.update === "checking"} onClick={() => void checkForUpdate()}>
                {t("Check for updates")}
              </button>
            )
          )}
        </div>
      </Section>

      {showShare ? (
      <Section
        id="settings-sharing"
        title="Sharing"
        about="A share can open in the editor, or be added the same way as a line typed in the box. A bare address becomes a link. A line in quotation marks becomes a quotation. Anything else is a draft."
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={shareEdit}
            className={shareEdit ? `${btnPrimary} justify-center px-2` : `${btnSurface} justify-center px-2`}
            onClick={() => {
              if (!shareEdit) onShareEdit(true);
            }}
          >
            {t("Open editor")}
          </button>
          <button
            type="button"
            aria-pressed={!shareEdit}
            className={!shareEdit ? `${btnPrimary} justify-center px-2` : `${btnSurface} justify-center px-2`}
            onClick={() => {
              if (shareEdit) onShareEdit(false);
            }}
          >
            {t("Add it")}
          </button>
        </div>
      </Section>
      ) : null}

      <Section id="settings-trash" title="Trash" about="Removed notes stay here until you restore them or empty the trash.">
        <p className="text-sm text-muted tabular-nums">{trash.length === 1 ? t("1 note") : t("{n} notes", { n: trash.length })}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={btnSurface} onClick={onViewTrash}>
            <Trash2 className="size-4" />
            {t("View trash")}
          </button>
          <button type="button" className={btnGhost} onClick={onRestoreAll}>
            {t("Restore all")}
          </button>
          <button type="button" className={btnInk} onClick={onEmptyTrash}>
            {t("Empty trash")}
          </button>
        </div>
      </Section>

      <SealSection
        sealed={sealed}
        passkey={passkey}
        onSeal={onSeal}
        onUnseal={onUnseal}
        onChange={onChangePassphrase}
        onRecovery={onNewRecovery}
        onEnroll={onEnrollDevice}
        onRemoveDevice={onRemoveDevice}
        onLock={onLock}
      />

      <Section
        id="settings-language"
        title="Language"
        about="The app uses this language: the settings, the buttons, and these notes. Quotations lead in it when that wording is here. Page names do the same. This device is the default. Lingua Latina is always listed. Other languages appear when a page or a quotation brings them in."
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
          {t("App language")}
          <select className="field" value={language} onChange={(event) => onLanguage(event.target.value)}>
            {languageChoices(notes, language).map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.id === "system" ? `${t("This device")} · ${languageName(systemLanguage())}` : choice.label}
              </option>
            ))}
          </select>
        </label>
      </Section>

      <Section
        id="settings-theme"
        title="Theme"
        about="The theme is the frame: windows, bars, and corners. It does not choose the colours."
      >
        <div className="flex flex-wrap gap-2">
          {THEMES.map((item) => {
            const swatch = THEME_SWATCH[NATIVE_SCHEME[item]];
            return (
              <button
                key={item}
                type="button"
                aria-pressed={theme === item}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold"
                style={{
                  background: swatch.bg,
                  color: swatch.fg,
                  borderColor: theme === item ? swatch.primary : swatch.border,
                  boxShadow: theme === item ? `inset 0 0 0 1px ${swatch.primary}` : undefined,
                }}
                onClick={() => onTheme(item)}
              >
                {t(THEME_LABEL[item])}
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        id="settings-scheme"
        title="Colour scheme"
        about="The colour scheme is the ink and the paper. It pairs with any theme."
      >
        <div className="flex flex-wrap gap-2">
          {SCHEMES.map((item) => {
            const swatch = THEME_SWATCH[item];
            return (
              <button
                key={item}
                type="button"
                aria-pressed={scheme === item}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold"
                style={{
                  background: swatch.bg,
                  color: swatch.fg,
                  borderColor: scheme === item ? swatch.primary : swatch.border,
                  boxShadow: scheme === item ? `inset 0 0 0 1px ${swatch.primary}` : undefined,
                }}
                onClick={() => onScheme(item)}
              >
                <span className="size-3 shrink-0 rounded-full" style={{ background: swatch.primary }} />
                {t(THEME_LABEL[item])}
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        id="settings-type"
        title="Type"
        about="The faces are kept in the app. Nothing is fetched when you switch. Size scales the whole page."
      >
        <div className="flex flex-wrap gap-2">
          {FACES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={face === item}
              className={face === item ? `${btnPrimary} justify-center` : `${btnSurface} justify-center`}
              style={{ fontFamily: FACE_FAMILY[item] }}
              onClick={() => onFace(item)}
            >
              {FACE_LABEL[item]}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {TYPE_SIZES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={typeSize === item}
              className={typeSize === item ? `${btnPrimary} justify-center px-2` : `${btnSurface} justify-center px-2`}
              onClick={() => onTypeSize(item)}
            >
              {t(TYPE_SIZE_LABEL[item])}
            </button>
          ))}
        </div>
      </Section>

      <Section id="settings-search" title="Search" about={searchAbout(searchModel, embed)}>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["off", t("Off")],
              ["e5", "E5"],
              ["gemma", "Gemma"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={searchModel === id}
              className={searchModel === id ? `${btnPrimary} justify-center px-2` : `${btnSurface} justify-center px-2`}
              onClick={() => {
                onSearchModel(id);
                chooseModel(id);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section
        id="settings-links"
        title="Link previews"
        about="This turns link previews on and off. On keeps a small picture and the page title with the address. Off shows only the address. A picture already kept stays on the note."
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={linkPreviews}
            className={linkPreviews ? `${btnPrimary} justify-center px-2` : `${btnSurface} justify-center px-2`}
            onClick={() => {
              if (!linkPreviews) onLinkPreviews(true);
            }}
          >
            {t("On")}
          </button>
          <button
            type="button"
            aria-pressed={!linkPreviews}
            className={!linkPreviews ? `${btnPrimary} justify-center px-2` : `${btnSurface} justify-center px-2`}
            onClick={() => {
              if (linkPreviews) onLinkPreviews(false);
            }}
          >
            {t("Off")}
          </button>
        </div>
      </Section>

      <Section
        id="settings-layout"
        title="Layout"
        about="Right-handed puts the scope rail and the buttons on the right, and left-handed puts them on the left. Floating is a vertical stack over the lower tail of the timeline. Strip is a transparent row, so the page stays clear. Scope lines, period rules, and the Now line share the line weight."
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={rightHanded}
            className={rightHanded ? `${btnPrimary} justify-center px-2` : `${btnSurface} justify-center px-2`}
            onClick={() => {
              if (!rightHanded) onToggleHand();
            }}
          >
            {t("Right")}
          </button>
          <button
            type="button"
            aria-pressed={!rightHanded}
            className={!rightHanded ? `${btnPrimary} justify-center px-2` : `${btnSurface} justify-center px-2`}
            onClick={() => {
              if (rightHanded) onToggleHand();
            }}
          >
            {t("Left")}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={toolbar === "float"}
            className={toolbar === "float" ? `${btnPrimary} justify-center px-2` : `${btnSurface} justify-center px-2`}
            onClick={() => {
              if (toolbar !== "float") onToggleToolbar();
            }}
          >
            {t("Floating")}
          </button>
          <button
            type="button"
            aria-pressed={toolbar === "strip"}
            className={toolbar === "strip" ? `${btnPrimary} justify-center px-2` : `${btnSurface} justify-center px-2`}
            onClick={() => {
              if (toolbar !== "strip") onToggleToolbar();
            }}
          >
            {t("Strip")}
          </button>
        </div>
        <p className="mt-3 text-sm text-muted">{t("Composer")}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={enterSends}
            className={enterSends ? `${btnPrimary} justify-center px-2` : `${btnSurface} justify-center px-2`}
            onClick={() => {
              if (!enterSends) onEnterSends(true);
            }}
          >
            {t("Return adds")}
          </button>
          <button
            type="button"
            aria-pressed={!enterSends}
            className={!enterSends ? `${btnPrimary} justify-center px-2` : `${btnSurface} justify-center px-2`}
            onClick={() => {
              if (enterSends) onEnterSends(false);
            }}
          >
            {t("Shift+Return adds")}
          </button>
        </div>
        <p className="mt-3 text-sm text-muted">{t("Line weight")}</p>
        <div className="flex flex-wrap gap-2">
          {RULES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={rule === item}
              className={rule === item ? `${btnPrimary} justify-center px-2` : `${btnSurface} justify-center px-2`}
              onClick={() => onRule(item)}
            >
              {t(RULE_LABEL[item])}
            </button>
          ))}
        </div>
      </Section>

      <Section id="settings-statistics" title="Statistics" about="Notes is everything kept. Media counts pictures and clips saved in the journal, not an address that still points elsewhere. Size is the whole backup. In media is how much of that backup those files take. Allowance is what this browser will give the site. Used is everything the site has stored. Left is the remainder.">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-surface px-3 py-3 lift">
            <dt className="text-muted">{t("Notes")}</dt>
            <dd className="font-display text-3xl text-fg tabular-nums">{notes.length}</dd>
          </div>
          <div className="rounded-xl bg-surface px-3 py-3 lift">
            <dt className="text-muted">{t("Media")}</dt>
            <dd className="font-display text-3xl text-fg tabular-nums">{pictures.count}</dd>
          </div>
          <div className="rounded-xl bg-surface px-3 py-3 lift">
            <dt className="text-muted">{t("Size")}</dt>
            <dd className="font-display text-3xl text-fg tabular-nums">{formatBytes(bytes)}</dd>
          </div>
          <div className="rounded-xl bg-surface px-3 py-3 lift">
            <dt className="text-muted">{t("In media")}</dt>
            <dd className="font-display text-3xl text-fg tabular-nums">{formatBytes(pictures.bytes)}</dd>
          </div>
          {room ? (
            <>
              <div className="rounded-xl bg-surface px-3 py-3 lift">
                <dt className="text-muted">{t("Allowance")}</dt>
                <dd className="font-display text-3xl text-fg tabular-nums">{formatBytes(room.quota)}</dd>
              </div>
              <div className="rounded-xl bg-surface px-3 py-3 lift">
                <dt className="text-muted">{t("Used")}</dt>
                <dd className="font-display text-3xl text-fg tabular-nums">{formatBytes(room.usage)}</dd>
              </div>
              <div className="rounded-xl bg-surface px-3 py-3 lift">
                <dt className="text-muted">{t("Left")}</dt>
                <dd className="font-display text-3xl text-fg tabular-nums">{formatBytes(Math.max(0, room.quota - room.usage))}</dd>
              </div>
            </>
          ) : null}
        </dl>
        {Object.keys(byType).length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2 text-sm text-muted">
            {Object.entries(byType)
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([type, count]) => (
                <li key={type} className="rounded-full bg-bg px-2.5 py-1">
                  {typeLabel(type)} <span className="tabular-nums text-fg">{count}</span>
                </li>
              ))}
          </ul>
        )}
      </Section>

      <Section
        id="settings-sample"
        title="Sample"
        about="A life, with the ordinary notes outnumbering the quotations. It can be removed."
      >
        <button type="button" className={btnSurface} onClick={onSample}>
          {t("Load a sample timeline")}
        </button>
      </Section>
    </div>
  );
}

function useAllowance() {
  const [room, setRoom] = useState<{ quota: number; usage: number } | null>(null);
  useEffect(() => {
    const estimate = navigator.storage?.estimate?.bind(navigator.storage);
    if (!estimate) return;
    let stop = false;
    void estimate()
      .then((result) => {
        if (stop || typeof result.quota !== "number" || typeof result.usage !== "number") return;
        setRoom({ quota: result.quota, usage: result.usage });
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, []);
  return room;
}

function pictureStats(notes: Note[]) {
  let count = 0;
  let bytes = 0;
  for (const note of notes) {
    for (const file of [note.image, note.preview?.image, note.video]) {
      if (!file?.startsWith("data:image/") && !file?.startsWith("data:video/")) continue;
      count += 1;
      bytes += file.length;
    }
  }
  return { count, bytes };
}

function appStatus(pwa: ReturnType<typeof getPwaSnapshot>) {
  if (pwa.update === "unsupported") return t("This browser cannot install TLNotes, and updates are not available here.");
  if (pwa.update === "ready") {
    return pwa.installed
      ? t("An update is ready and waits until you apply it. Export from Data first if you want a copy.")
      : t("An update is ready. This copy stays until you apply it. Export from Data first if you want a copy.");
  }
  if (pwa.update === "checking") return t("Checking the published copy.");
  if (pwa.update === "unconfirmed") return t("This check could not see the published copy, so nothing was called current and nothing was applied.");
  if (pwa.installed) return t("This is an installed PWA.");
  if (pwa.iosHint) return t("In Safari, use Share, then Add to Home Screen.");
  if (pwa.update === "current") return t("This copy matches the published one. A newer one will wait until you apply it.");
  return t("Check compares this copy with the published one. Nothing changes until you apply an update.");
}

function searchAbout(model: SearchModel, embed: EmbedStatus) {
  const choice =
    model === "e5"
      ? t("Multilingual E5 is a smaller model made for search across languages.")
      : model === "gemma"
        ? t("EmbeddingGemma is a larger multilingual model. The copy used here is reduced so it can stay on the device.")
        : t("No meaning model is on. Text search still works.");
  const progress =
    embed.model !== "off" && embed.detail
      ? ` ${tLine(embed.detail)}`
      : "";
  const read = embed.state === "ready" && embed.total > 0 ? ` ${t("{done} of {total} read.", { done: embed.indexed, total: embed.total })}` : "";
  return `${t("A search is BM25 over the view that is open. Stem and Fuzzy sit on the search itself. A meaning model is optional, fetched once, and kept in this browser. It is not part of the backup.")} ${choice}${progress}${read}`;
}

function Section({ id, title, about, children }: { id: string; title: string; about?: string; children: ReactNode }) {
  const heading = t(title);
  const note = about ? t(about) : "";
  return (
    <section id={id} className="mt-5 scroll-mt-28 border-t border-border pt-5">
      <div className="flex items-center gap-1">
        <h2 className="font-display text-2xl text-fg">{heading}</h2>
        {note ? <InfoButton title={heading} text={note} /> : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const CONTENTS = [
  { id: "settings-data", title: "Data" },
  { id: "settings-sync", title: "Sync" },
  { id: "settings-app", title: "App" },
  { id: "settings-sharing", title: "Sharing" },
  { id: "settings-trash", title: "Trash" },
  { id: "settings-seal", title: "Seal" },
  { id: "settings-language", title: "Language" },
  { id: "settings-theme", title: "Theme" },
  { id: "settings-scheme", title: "Colour scheme" },
  { id: "settings-type", title: "Type" },
  { id: "settings-search", title: "Search" },
  { id: "settings-links", title: "Link previews" },
  { id: "settings-layout", title: "Layout" },
  { id: "settings-statistics", title: "Statistics" },
  { id: "settings-sample", title: "Sample" },
];

function openSection(id: string) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

export function SyncDoor({ create }: { create: boolean }) {
  const sync = useSyncExternalStore(subscribeSync, syncSnapshot, syncSnapshot);
  const detail = sync.detail === "No sync file yet." ? t("Choose the file both devices share.") : tLine(sync.detail);
  return (
    <div className="flex h-dvh items-center justify-center bg-bg px-6 text-fg">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl">{t("Sync file")}</h1>
        <p className="mt-3 text-sm text-pretty text-muted">{t(detail)}</p>
        <button type="button" className={`${btnPrimary} mt-4`} onClick={() => void chooseSyncFile(create)}>
          {create ? t("New sync file") : t("Use a sync file")}
        </button>
      </div>
    </div>
  );
}
