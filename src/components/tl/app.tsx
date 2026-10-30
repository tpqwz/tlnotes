import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ClipboardEvent, type ReactNode } from "react";
import { Eye, EyeOff, Filter, Home, ListTodo, Paperclip, Search, Settings, X } from "lucide-react";
import { toast, Toaster } from "sonner";
import { TIMELINE_TYPES, cleanMediaFacts, isPageType, linkFromText, noteMatches, parseImport, quotationFromText, typeLabel, type Filters, type MediaFacts, type Note } from "@/lib/tl/model";
import { compressImage, compressVideo } from "@/lib/tl/media";
import { ingestAddress } from "@/lib/tl/watch";
import { t, tLine } from "@/lib/tl/i18n";
import { calendarNotes, notesToIcs, parseIcs } from "@/lib/tl/ics";
import { sampleNotes } from "@/lib/tl/sample";
import { finishIncomingShare, listenNativeShare, noteFromShare, peekIncomingShare, pullShare, shareAsTyped } from "@/lib/tl/share";
import {
  acceptUnlocked,
  applyType,
  downloadJson,
  downloadText,
  exportFilename,
  exportPayload,
  onPersistError,
  openJournal,
  journalRemoved,
  savePersisted,
  whenSaved,
  type Face,
  type Persisted,
  type Scheme,
  type Theme,
  type TypeSize,
} from "@/lib/tl/storage";
import { rememberJournal, startSync, syncDoorMode } from "@/lib/tl/sync";
import {
  changePassphrase,
  enrollPasskey,
  hasPasskey,
  isVaultOn,
  lockVault,
  removePasskey,
  replaceRecovery,
  sealJournal,
  unlockWithPasskey,
  unlockWithSecret,
  unsealJournal,
} from "@/lib/tl/vault";
import { UnlockScreen } from "@/components/tl/vault";
import { startPwa } from "@/lib/tl/pwa";
import { Timeline } from "@/components/tl/timeline";
import { ConfirmDialog, EditorDialog, FilterDialog, HazardNotice, JumpDialog } from "@/components/tl/dialogs";
import { SettingsView, SyncDoor } from "@/components/tl/settings";
import { TrashView } from "@/components/tl/trash";
import { TaskList, type TaskSort } from "@/components/tl/tasks";
import { fillShelf } from "@/lib/tl/pictures";
import { blendNotes, rankNotes } from "@/lib/tl/search";
import { chooseModel, embedStatus, scoreMeaning, subscribeEmbed, watchNotes, type SearchModel } from "@/lib/tl/embed";
import { btnPrimary, cn } from "@/components/tl/ui";

type View = "timeline" | "settings" | "trash";
const noMeaning = new Map<string, number>();
type Trail = { scroll: number; view: View; taskMode: boolean };

type ConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
};

const defaultFilters = (): Filters => ({ types: [...TIMELINE_TYPES], tags: [], search: "" });

function filtersAreDefault(filters: Filters) {
  return (
    filters.tags.length === 0 &&
    filters.search.trim() === "" &&
    filters.types.length === TIMELINE_TYPES.length &&
    TIMELINE_TYPES.every((type) => filters.types.includes(type))
  );
}

export function TimelineApp() {
  const [data, setData] = useState<Persisted | null>(null);
  const dataRef = useRef<Persisted | null>(null);
  const [view, setView] = useState<View>("timeline");
  const [syncDoor, setSyncDoor] = useState<"open" | "new" | null>(null);
  const [meaningScores, setMeaningScores] = useState<Map<string, number>>(new Map());
  const embed = useSyncExternalStore(subscribeEmbed, embedStatus, embedStatus);
  const [compactMark, setCompactMark] = useState(false);
  const trailRef = useRef<HTMLHeadingElement>(null);
  const viewRef = useRef<View>("timeline");
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [hazard, setHazard] = useState(true);
  const [hazardLost, setHazardLost] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef("");
  const [hasText, setHasText] = useState(false);
  const [held, setHeld] = useState<{ image: string; video: string; imageFacts?: MediaFacts; videoFacts?: MediaFacts }>({ image: "", video: "" });
  const [shrinking, setShrinking] = useState(false);
  const [taskMode, setTaskMode] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [taskTags, setTaskTags] = useState<string[]>([]);
  const [taskSort, setTaskSort] = useState<TaskSort>("order");
  const [locked, setLocked] = useState(false);
  const [deviceUnlock, setDeviceUnlock] = useState(false);
  const [place, setPlace] = useState("");
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpIndex, setJumpIndex] = useState<{ year: number; months: string[] }[]>([]);
  const skipRestore = useRef(false);
  const wantPresent = useRef(false);
  const pushTrail = useRef(false);
  const prevView = useRef<View | null>(null);
  const scrollTimer = useRef<number | null>(null);
  const placeFrame = useRef(0);
  const spotsRef = useRef<Spot[]>([]);
  const taskModeRef = useRef(false);
  const addTypedRef = useRef<(content: string, forcedType?: string | null) => void>(() => {});
  const overlayRef = useRef({ search: false, filter: false, edit: false, jump: false, confirm: false });
  taskModeRef.current = taskMode;
  overlayRef.current = {
    search: searchOpen,
    filter: filterOpen,
    edit: editingId != null,
    jump: jumpOpen,
    confirm: confirm != null,
  };

  useEffect(() => {
    const root = document.documentElement;
    const probe = document.getElementById("tl-safe-probe");
    if (probe) document.body.appendChild(probe);
    const view = window.visualViewport;
    const keyboard = (navigator as Navigator & { virtualKeyboard?: EventTarget }).virtualKeyboard;

    function screenCss() {
      let height = window.screen.height;
      let avail = window.screen.availHeight;
      let top = (window.screen as Screen & { availTop?: number }).availTop || 0;
      const inner = window.innerHeight;
      if (inner > 0 && height > inner * 1.5) {
        const dpr = window.devicePixelRatio || 1;
        height /= dpr;
        avail /= dpr;
        top /= dpr;
      }
      return { height, avail, top };
    }

    function fit() {
      const next = window.visualViewport;
      const inner = window.innerHeight;
      if (next && inner - next.height > 160) {
        root.style.setProperty("--vv-offset", `${Math.round(next.offsetTop)}px`);
        root.style.setProperty("--vv-height", `${Math.round(next.height)}px`);
      } else {
        root.style.removeProperty("--vv-offset");
        root.style.removeProperty("--vv-height");
      }
      const safe = probe ? probe.getBoundingClientRect().height : 0;
      const { height, avail, top } = screenCss();
      const system = window.matchMedia("(pointer: coarse)").matches ? Math.round(height - top - avail) : 0;
      const usableSystem = system >= 1 && system <= 80 ? system : 0;
      const visibleBottom = (next?.offsetTop ?? 0) + (next?.height ?? inner);
      const visibleReachesWindow = inner - visibleBottom < 1;
      const windowReachesScreen = (window.screenY || 0) + inner >= height - 4;
      const overSystemBar = visibleReachesWindow && windowReachesScreen ? usableSystem : 0;
      const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
      const nativeAndroid = cap?.isNativePlatform?.() === true && cap.getPlatform?.() === "android";
      if (nativeAndroid) document.documentElement.dataset.native = "android";
      else delete document.documentElement.dataset.native;
      const injected = Number.parseFloat(getComputedStyle(root).getPropertyValue("--safe-area-inset-bottom")) || 0;
      const inset = Math.max(safe, injected);
      const vvBottom = (next?.offsetTop ?? 0) + (next?.height ?? inner);
      const alreadyClear = Math.max(0, Math.round(height - top - (window.screenY || 0) - vvBottom));
      const covered = Math.max(0, Math.round(inset - alreadyClear));
      const obstruction = nativeAndroid ? covered : Math.max(safe, overSystemBar);
      root.style.setProperty("--obstruction", `${obstruction}px`);
      const frame = document.querySelector(".app-frame");
      const header = document.getElementById("tl-header");
      const composer = document.getElementById("tl-composer");
      if (frame instanceof HTMLElement && header instanceof HTMLElement && composer instanceof HTMLElement) {
        const headerBox = header.getBoundingClientRect();
        const composerBox = composer.getBoundingClientRect();
        root.style.setProperty("--info-top", `${Math.round(headerBox.bottom + 12)}px`);
        root.style.setProperty("--info-bottom", `${Math.round(window.innerHeight - composerBox.top + 12)}px`);
      }
    }

    fit();
    view?.addEventListener("resize", fit);
    window.addEventListener("resize", fit);
    window.addEventListener("orientationchange", fit);
    window.screen.orientation?.addEventListener("change", fit);
    keyboard?.addEventListener("geometrychange", fit);
    const observed = new ResizeObserver(fit);
    if (probe) observed.observe(probe);
    const header = document.getElementById("tl-header");
    const composer = document.getElementById("tl-composer");
    if (header) observed.observe(header);
    if (composer) observed.observe(composer);
    return () => {
      view?.removeEventListener("resize", fit);
      window.removeEventListener("resize", fit);
      window.removeEventListener("orientationchange", fit);
      window.screen.orientation?.removeEventListener("change", fit);
      keyboard?.removeEventListener("geometrychange", fit);
      observed.disconnect();
    };
  }, []);

  useEffect(() => {
    const stop = startSync((nextNotes, nextTrash) => {
      const current = dataRef.current;
      if (!current) return;
      commit({ ...current, notes: nextNotes, trash: nextTrash }, true);
    });
    onPersistError((message) => toast.error(tLine(message)));
    let cancel = false;
    void openJournal().then((opened) => {
      if (cancel) return;
      applyType(opened.data.settings);
      setLocked(opened.locked);
      setDeviceUnlock(hasPasskey());
      if (opened.locked) {
        dataRef.current = opened.data;
        setData(opened.data);
        return;
      }
      const loaded = opened.data;
      if (opened.missing) {
        setHazardLost(true);
        setHazard(true);
      } else if (!opened.hadStore && loaded.notes.length === 0 && loaded.trash.length === 0) {
        loaded.notes = sampleNotes(Date.now()).filter((note) => !isPageType(note.type));
        savePersisted(loaded, true);
      } else if (loaded.notes.some((note) => note.id === "sample-college")) {
        const owned = new Set([...loaded.notes, ...loaded.trash].map((note) => note.id));
        const extras = sampleNotes(Date.now()).filter((note) => !owned.has(note.id) && !isPageType(note.type));
        if (extras.length > 0) loaded.notes = [...loaded.notes, ...extras];
        const stamped = loaded.notes.map((note) =>
          note.id === "sample-quote" && !note.originalLanguage ? { ...note, originalLanguage: "English" } : note,
        );
        if (extras.length > 0 || stamped.some((note, index) => note !== loaded.notes[index])) {
          loaded.notes = stamped;
          savePersisted(loaded, true);
        }
      }
      dataRef.current = loaded;
      setData(loaded);
      rememberJournal(loaded.notes, loaded.trash, journalRemoved());
    });
    return () => {
      cancel = true;
      stop();
    };
  }, []);

  useEffect(() => {
    startPwa();
  }, []);

  useEffect(() => {
    if (!data || locked || data.settings.linkPreviews === false) return;
    let stop = false;
    void fillShelf(
      data.notes,
      (id, partial) => {
        if (stop) return;
        const current = dataRef.current;
        if (!current) return;
        patch({ notes: current.notes.map((item) => (item.id === id ? { ...item, ...partial } : item)) }, true);
      },
      () => stop,
    );
    return () => {
      stop = true;
    };
    // A saved picture does not restart the walk. A new note does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, data?.settings.linkPreviews, data?.notes.map((note) => note.id).join("|")]);

  useEffect(() => {
    if (!data) return;
    let cancel = false;
    const accept = (incoming: Awaited<ReturnType<typeof pullShare>>) => {
      if (cancel) return;
      finishIncomingShare();
      const current = dataRef.current;
      if (!incoming || !current) return;
      if (current.settings.shareEdit === false) {
        addTypedRef.current(shareAsTyped(incoming));
        return;
      }
      const note = noteFromShare(incoming);
      if (!note || current.notes.some((item) => item.id === note.id)) return;
      patch({ notes: [...current.notes, note] });
      setTaskMode(false);
      setView("timeline");
      setEditingId(note.id);
      toast.success(note.type === "link" ? t("Link shared in") : t("Text shared in. Make it a quotation if these are someone else's words."));
    };
    void peekIncomingShare().then(accept);
    const stopNative = listenNativeShare((incoming) => accept(incoming));
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "tlnotes-share") return;
      void pullShare().then(accept);
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      cancel = true;
      stopNative();
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [data]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useLayoutEffect(() => {
    try {
      if (window.parent !== window) return;
    } catch {
      return;
    }
    function rearm() {
      const landed = history.state as { tlGuard?: boolean; tlFloor?: boolean } | null;
      if (landed?.tlGuard && !landed.tlFloor) return;
      const base = landed && typeof landed === "object" ? landed : {};
      history.pushState({ ...base, tl: trailNow(), tlReady: true, tlFloor: false, tlGuard: true }, "");
    }
    function dismissOverlay() {
      const overlay = overlayRef.current;
      if (overlay.confirm) {
        setConfirm(null);
        return true;
      }
      if (overlay.edit) {
        setEditingId(null);
        return true;
      }
      if (overlay.jump) {
        setJumpOpen(false);
        return true;
      }
      if (overlay.filter) {
        setFilterOpen(false);
        return true;
      }
      if (overlay.search) {
        setSearchOpen(false);
        return true;
      }
      return false;
    }
    function hold() {
      writeTrail("push", trailNow());
    }
    function onPop(event: PopStateEvent) {
      const state = event.state as { tl?: Trail; tlFloor?: boolean } | null;
      const now = history.state as { tlGuard?: boolean; tlFloor?: boolean } | null;
      const rearmed = Boolean(now && now !== state && now.tlGuard && !now.tlFloor);
      if (dismissOverlay()) {
        if (!rearmed) hold();
        return;
      }
      if (viewRef.current !== "timeline" || taskModeRef.current) {
        taskModeRef.current = false;
        viewRef.current = "timeline";
        setTaskMode(false);
        setView("timeline");
        if (!rearmed) hold();
        return;
      }
      if (state?.tl && !state.tlFloor) {
        skipRestore.current = true;
        wantPresent.current = false;
        setTaskMode(state.tl.taskMode);
        setView(state.tl.view === "settings" || state.tl.view === "trash" ? state.tl.view : "timeline");
        requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: state.tl?.scroll ?? 0, behavior: "auto" }));
        rearm();
        return;
      }
      if (!rearmed) hold();
      rearm();
    }
    window.addEventListener("popstate", onPop);
    if (window.history.scrollRestoration) window.history.scrollRestoration = "manual";
    const state = history.state as { tlReady?: boolean; tlGuard?: boolean } | null;
    if (!state?.tlReady && !state?.tlGuard) {
      const floor = { ...(history.state && typeof history.state === "object" ? history.state : {}), tl: trailNow(), tlReady: true, tlFloor: true, tlGuard: true };
      history.replaceState(floor, "");
      history.pushState({ ...floor, tlFloor: false }, "");
    }
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!flashId) return;
    const timer = window.setTimeout(() => setFlashId(null), 2000);
    return () => window.clearTimeout(timer);
  }, [flashId]);

  useEffect(() => {
    if (view === "settings") setSearchOpen(false);
    if (view !== "timeline") setFilterOpen(false);
  }, [view]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  useLayoutEffect(() => {
    if (view === "settings" || view === "trash") scrollRef.current?.scrollTo({ top: 0 });
  }, [view]);

  useEffect(() => {
    if (!data) return;
    if (prevView.current === view) return;
    const from = prevView.current;
    prevView.current = view;
    if (view !== "timeline") return;
    if (skipRestore.current) {
      skipRestore.current = false;
      return;
    }
    if (from === null || from !== "timeline") {
      const top = dataRef.current?.settings.scrollTop ?? 0;
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top }));
    }
  }, [view, data]);

  useEffect(() => {
    if (!flashId || view !== "timeline") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      if (viewRef.current === "timeline" && !taskModeRef.current) {
        scrollToNow();
        return;
      }
      document.querySelector(`[data-note-id="${CSS.escape(flashId)}"]`)?.scrollIntoView({
        block: "center",
        behavior: reduce ? "auto" : "smooth",
      });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [flashId, view]);

  useEffect(() => {
    if (!wantPresent.current || view !== "timeline" || taskMode || !data) return;
    wantPresent.current = false;
    const frame = window.requestAnimationFrame(() => {
      const root = scrollRef.current;
      if (!root) return;
      const top = nowOffset(root);
      scrollToNow();
      if (pushTrail.current) {
        pushTrail.current = false;
        writeTrail("push", { scroll: top, view: "timeline", taskMode: false });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [view, taskMode, data]);

  function trailNow(): Trail {
    return { scroll: scrollRef.current?.scrollTop ?? 0, view: viewRef.current, taskMode: taskModeRef.current };
  }

  function writeTrail(method: "replace" | "push", trail: Trail) {
    const state = history.state && typeof history.state === "object" ? history.state : {};
    const next = { ...state, tl: trail, tlReady: true, tlFloor: false, tlGuard: true };
    if (method === "replace") history.replaceState(next, "");
    else history.pushState(next, "");
  }

  function commit(next: Persisted, quiet = false, replace = false) {
    applyType(next.settings);
    dataRef.current = next;
    setData(next);
    savePersisted(next, quiet, replace);
  }

  function patch(partial: Partial<Persisted>, quiet = false, replace = false) {
    const current = dataRef.current;
    if (!current) return;
    commit({ ...current, ...partial }, quiet, replace);
  }

  function rememberScroll(top: number) {
    const current = dataRef.current;
    if (!current) return;
    current.settings.scrollTop = top;
    savePersisted(current, true);
  }

  function scrollToNow() {
    const root = scrollRef.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.scrollTo({ top: nowOffset(root), behavior: reduce ? "auto" : "smooth" });
  }

  function goPresent() {
    const onTimeline = viewRef.current === "timeline" && !taskModeRef.current;
    const from = trailNow();
    if (onTimeline) {
      const root = scrollRef.current;
      if (!root) return;
      const top = nowOffset(root);
      if (Math.abs(from.scroll - top) < 32) return;
      writeTrail("replace", from);
      scrollToNow();
      writeTrail("push", { scroll: top, view: "timeline", taskMode: false });
      return;
    }
    writeTrail("replace", from);
    pushTrail.current = true;
    skipRestore.current = true;
    setView("timeline");
    setTaskMode(false);
    wantPresent.current = true;
  }

  useEffect(() => {
    const row = trailRef.current;
    if (!row) return;
    const fit = () => {
      const mark = row.querySelector("[data-mark]");
      if (!(mark instanceof HTMLElement)) return;
      const crumbs = [...row.querySelectorAll<HTMLElement>("[data-crumb]")];
      const held = crumbs.map((item) => item.style.flexShrink);
      const shown = mark.textContent;
      for (const item of crumbs) item.style.flexShrink = "0";
      mark.textContent = "TLNotes";
      const needsCompact = row.scrollWidth > row.clientWidth + 1;
      mark.textContent = shown;
      crumbs.forEach((item, index) => {
        item.style.flexShrink = held[index] ?? "";
      });
      setCompactMark((current) => (current === needsCompact ? current : needsCompact));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(row);
    return () => observer.disconnect();
  }, [view, taskMode, place]);

  function openJump() {
    const root = scrollRef.current;
    if (!root) return;
    setJumpIndex(collectMarks(root));
    setJumpOpen(true);
  }

  function jumpTo(year: string, month: string | null) {
    const root = scrollRef.current;
    if (!root) return;
    let target: HTMLElement | null = null;
    if (month) {
      let inYear = false;
      for (const mark of root.querySelectorAll<HTMLElement>("[data-mark]")) {
        if (mark.dataset.mark === "year") inYear = mark.dataset.label === year;
        else if (inYear && mark.dataset.mark === "month" && mark.dataset.label === month) {
          target = mark;
          break;
        }
      }
    }
    if (!target) target = root.querySelector(`[data-mark="year"][data-label="${CSS.escape(year)}"]`);
    if (!target) return;
    const top = Math.max(0, target.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - 8);
    const from = trailNow();
    if (from.view === "timeline" && !from.taskMode && Math.abs(from.scroll - top) < 32) {
      setJumpOpen(false);
      return;
    }
    writeTrail("replace", from);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
    writeTrail("push", { scroll: top, view: "timeline", taskMode: false });
    setJumpOpen(false);
  }

  function addTyped(content: string, forcedType?: string | null, media?: { image?: string; video?: string; imageFacts?: MediaFacts; videoFacts?: MediaFacts }, notice?: string) {
    const current = dataRef.current;
    const text = content.trim();
    const image = media?.image ?? "";
    const video = media?.video ?? "";
    if ((!text && !image && !video) || !current) return;
    const now = Date.now();
    const asTask = !forcedType && taskModeRef.current && viewRef.current === "timeline";
    const linked = asTask || !text || (forcedType && forcedType !== "link") ? null : linkFromText(text);
    const quoted = asTask || linked || !text || (forcedType && forcedType !== "quotation") ? null : quotationFromText(text);
    const loneVideo = Boolean(video) && !text && !forcedType;
    const loneImage = Boolean(image) && !video && !text && !forcedType;
    const type = loneVideo ? "video" : loneImage ? "image" : forcedType || (asTask ? "task" : linked ? "link" : quoted ? "quotation" : "draft");
    const note: Note = {
      id: crypto.randomUUID(),
      type,
      content: linked?.content ?? quoted?.text ?? text,
      tags: [],
      created: now,
      edited: now,
      date: null,
    };
    if (linked) {
      note.url = linked.url;
      if (linked.preview) note.preview = linked.preview;
    }
    if (quoted) {
      note.labels = [{ text: quoted.text, language: "" }];
      if (quoted.author) {
        note.sources = [
          {
            id: crypto.randomUUID(),
            author: quoted.author,
            work: quoted.work,
            container: "",
            edition: "",
            locator: "",
            published: "",
            url: "",
          },
        ];
      }
    }
    if ((image.startsWith("data:image/") || image.startsWith("https://")) && image.length < 1_200_000) note.image = image;
    if ((video.startsWith("data:video/") || video.startsWith("data:audio/") || video.startsWith("https://")) && video.length < 1_200_000) note.video = video;
    const imageFacts = cleanMediaFacts(media?.imageFacts);
    const videoFacts = cleanMediaFacts(media?.videoFacts);
    if (note.image && imageFacts) note.imageFacts = imageFacts;
    if (note.video && videoFacts) note.videoFacts = videoFacts;
    patch({ notes: [...current.notes, note] });
    if (!filters.types.includes(note.type)) setFilters((currentFilters) => ({ ...currentFilters, types: [...currentFilters.types, note.type] }));
    const visibleNow = noteMatches(note, {
      ...filters,
      types: filters.types.includes(note.type) ? filters.types : [...filters.types, note.type],
    });
    skipRestore.current = true;
    setView("timeline");
    glow(note.id);
    const added =
      type === "task"
        ? t("Task added")
        : type === "link"
          ? t("Link added")
          : type === "quotation"
            ? t("Quotation added")
            : type === "draft"
              ? t("Draft added")
              : type === "note"
                ? t("Note added")
                : type === "dream"
                  ? t("Dream added")
                  : type === "event"
                    ? t("Event added")
                    : type === "period"
                      ? t("Period added")
                      : type === "image"
                        ? t("Image added")
                        : type === "video"
                          ? t("Video added")
                          : t("Added");
    toast.success(notice ? tLine(notice) : (visibleNow ? added : t("Added. Clear search to see it.")));
  }

  addTypedRef.current = addTyped;

  async function addNote() {
    const content = draftRef.current.trim();
    if (!content && !held.image && !held.video) return;
    const only = !taskMode && view === "timeline" && filters.types.length === 1 ? filters.types[0] : null;
    const forced = only && !isPageType(only) ? only : null;
    if (!held.image && !held.video) {
      setShrinking(true);
      try {
        const taken = await ingestAddress(content);
        if (taken) {
          const type = forced ?? (taken.kind === "video" ? "video" : null);
          const notice = taken.kind === "video" && !taken.keptFile ? "Video added. The file could not be copied, so the address is kept." : undefined;
          addTyped(
            taken.caption,
            type,
            {
              image: taken.poster,
              video: taken.data,
              videoFacts: taken.kind === "video" ? taken.facts : undefined,
              imageFacts: taken.kind === "image" ? taken.facts : undefined,
            },
            notice,
          );
          clearComposer();
          return;
        }
      } catch (caught) {
        toast.error(caught instanceof Error ? tLine(caught.message) : t("Could not fetch that."));
        return;
      } finally {
        setShrinking(false);
      }
    }
    addTyped(content, forced, held);
    setHeld({ image: "", video: "" });
    clearComposer();
  }

  async function attachHeld(file: File | undefined) {
    if (!file) return;
    const kind = file.type || (/\.(png|jpe?g|gif|webp|bmp|avif|heic|heif)$/i.test(file.name) ? "image/" : /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.name) ? "video/" : "");
    if (!kind.startsWith("image/") && !kind.startsWith("video/")) {
      toast.error(t("Choose a picture or a video."));
      return;
    }
    setShrinking(true);
    try {
      if (kind.startsWith("video/")) {
        const kept = await compressVideo(file, file.name);
        setHeld((current) => ({ ...current, video: kept.data, videoFacts: { ...kept.facts, name: file.name } }));
      } else {
        const kept = await compressImage(file, file.name);
        setHeld((current) => ({ ...current, image: kept.data, imageFacts: { ...kept.facts, name: file.name } }));
      }
    } catch (caught) {
      toast.error(caught instanceof Error ? tLine(caught.message) : t("Could not attach that."));
    } finally {
      setShrinking(false);
    }
  }

  function pastedMedia(data: DataTransfer | null) {
    if (!data) return null;
    const ready = [...data.files].find((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
    if (ready) return ready;
    for (const item of data.items) {
      if (item.kind !== "file" || (!item.type.startsWith("image/") && !item.type.startsWith("video/"))) continue;
      const file = item.getAsFile();
      if (file) return file;
    }
    return null;
  }

  function pasteMedia(event: ClipboardEvent<HTMLTextAreaElement>) {
    const file = pastedMedia(event.clipboardData);
    if (file) {
      if (!event.clipboardData.getData("text/plain")) event.preventDefault();
      void attachHeld(file);
      return;
    }
    if (event.clipboardData.getData("text/plain") || !navigator.clipboard?.read) return;
    void navigator.clipboard
      .read()
      .then(async (entries) => {
        for (const entry of entries) {
          const type = entry.types.find((item) => item.startsWith("image/") || item.startsWith("video/"));
          if (!type) continue;
          const blob = await entry.getType(type);
          const extension = type.split("/")[1]?.replace(/[^a-z0-9].*$/i, "") || "png";
          await attachHeld(new File([blob], `pasted.${extension}`, { type }));
          return;
        }
      })
      .catch(() => undefined);
  }

  function saveNote(note: Note) {
    const current = dataRef.current;
    if (!current) return;
    patch({ notes: current.notes.map((item) => (item.id === note.id ? note : item)) });
    setEditingId(null);
    toast.success(t("Note updated"));
  }

  function glow(id: string) {
    setFlashId(null);
    window.setTimeout(() => setFlashId(id), 0);
  }

  function toggleDone(id: string) {
    const current = dataRef.current;
    if (!current) return;
    patch({
      notes: current.notes.map((note) => (note.id === id ? { ...note, done: !note.done, edited: Date.now() } : note)),
    });
  }

  function arrangeTasks(updates: { id: string; parentId: string | null; rank: number }[]) {
    const current = dataRef.current;
    if (!current || updates.length === 0) return;
    const byId = new Map(updates.map((item) => [item.id, item]));
    patch({
      notes: current.notes.map((note) => {
        const next = byId.get(note.id);
        if (!next) return note;
        const copy = { ...note, rank: next.rank };
        if (next.parentId) copy.parentId = next.parentId;
        else delete copy.parentId;
        return copy;
      }),
    });
  }

  function trashNote(id: string) {
    const current = dataRef.current;
    if (!current) return;
    const note = current.notes.find((item) => item.id === id);
    if (!note) return;
    patch({
      notes: current.notes.filter((item) => item.id !== id),
      trash: [{ ...note, trashedAt: Date.now() }, ...current.trash],
    });
    setEditingId(null);
    toast.success(t("Moved to trash"));
  }

  function restoreNote(id: string) {
    const current = dataRef.current;
    if (!current) return;
    const note = current.trash.find((item) => item.id === id);
    if (!note) return;
    const { trashedAt: _trashed, ...restored } = note;
    patch({ notes: [...current.notes, restored], trash: current.trash.filter((item) => item.id !== id) });
    toast.success(t("Note restored"));
  }

  function deleteForever(id: string) {
    if (!dataRef.current) return;
    setConfirm({
      title: t("Delete permanently"),
      message: t("This note will be permanently deleted and cannot be recovered."),
      confirmLabel: t("Delete"),
      onConfirm: () => {
        const current = dataRef.current;
        if (!current) return;
        patch({ trash: current.trash.filter((item) => item.id !== id) });
        setConfirm(null);
        toast.success(t("Note deleted"));
      },
    });
  }

  function removeSample() {
    const current = dataRef.current;
    if (!current) return;
    const notes = current.notes.filter((note) => !note.id.startsWith("sample-"));
    patch({ notes });
    toast.success(notes.length === current.notes.length ? t("No sample notes left") : t("Sample removed"));
  }

  function loadSample() {
    const current = dataRef.current;
    if (!current) return;
    const owned = new Set([...current.notes, ...current.trash].map((note) => note.id));
    const extras = sampleNotes(Date.now()).filter((note) => !owned.has(note.id) && !isPageType(note.type));
    if (extras.length === 0) {
      toast(t("Sample is already in the timeline"));
      return;
    }
    patch({ notes: [...current.notes, ...extras] });
    rememberScroll(0);
    skipRestore.current = true;
    setView("timeline");
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0 }));
    toast.success(t("Sample timeline added"));
  }

  function clearAll() {
    setConfirm({
      title: t("Clear all data"),
      message: t("This permanently deletes every note and everything in the trash. Layout settings stay."),
      confirmLabel: t("Clear all"),
      onConfirm: () => {
        if (!dataRef.current) return;
        patch({ notes: [], trash: [] }, false, true);
        setConfirm(null);
        setView("timeline");
        toast.success(t("All notes cleared"));
      },
    });
  }

  function emptyTrash() {
    const count = dataRef.current?.trash.length ?? 0;
    if (count === 0) {
      toast(t("Trash is already empty"));
      return;
    }
    setConfirm({
      title: "Empty trash",
      message: count === 1 ? t("Permanently delete {n} note? This cannot be undone.", { n: count }) : t("Permanently delete {n} notes? This cannot be undone.", { n: count }),
      confirmLabel: "Empty trash",
      onConfirm: () => {
        patch({ trash: [] });
        setConfirm(null);
        toast.success(t("Trash emptied"));
      },
    });
  }

  function restoreAll() {
    const current = dataRef.current;
    if (!current || current.trash.length === 0) {
      toast(t("Trash is empty"));
      return;
    }
    const count = current.trash.length;
    patch({
      notes: [...current.notes, ...current.trash.map(({ trashedAt: _trashed, ...note }) => note)],
      trash: [],
    });
    toast.success(count === 1 ? t("Restored {n} note", { n: count }) : t("Restored {n} notes", { n: count }));
  }

  async function exportJson() {
    const current = dataRef.current;
    if (!current) return;
    const result = await downloadJson(exportFilename(), exportPayload(current.notes, current.trash));
    if (result === "saved") toast.success(t("Exported"));
    else if (result === "blocked") toast.error(t("The browser blocked the save window. Open TLNotes in its own tab and export again."));
  }

  async function exportCalendar() {
    const current = dataRef.current;
    if (!current) return;
    const notes = calendarNotes(current.notes);
    if (notes.length === 0) {
      toast(t("Nothing dated to put on a calendar"));
      return;
    }
    const result = await downloadText("tlnotes.ics", notesToIcs(notes), "text/calendar");
    if (result === "saved") toast.success(t("Calendar exported"));
    else if (result === "blocked") toast.error(t("The browser blocked the save window. Open TLNotes in its own tab and export again."));
  }

  function mergeCalendar(incoming: Note[]) {
    const current = dataRef.current;
    if (!current) return;
    const map = new Map(current.notes.map((note) => [note.id, note]));
    for (const note of incoming) {
      const previous = map.get(note.id);
      map.set(
        note.id,
        previous
          ? { ...previous, ...note, tags: note.tags.length > 0 ? note.tags : previous.tags, done: note.done ?? previous.done }
          : note,
      );
    }
    patch({ notes: [...map.values()] });
  }

  async function onFile(file: File) {
    const text = await file.text();
    if (file.name.toLowerCase().endsWith(".ics") || /BEGIN:VCALENDAR/i.test(text)) {
      const notes = parseIcs(text);
      if (!notes || notes.length === 0) {
        toast.error(t("That calendar file had nothing to add"));
        return;
      }
      setConfirm({
        title: t("Import calendar"),
        message: notes.length === 1 ? t("Add {n} item from the calendar? Matching notes are updated, not duplicated.", { n: notes.length }) : t("Add {n} items from the calendar? Matching notes are updated, not duplicated.", { n: notes.length }),
        confirmLabel: t("Import"),
        onConfirm: () => {
          mergeCalendar(notes);
          setConfirm(null);
          setView("timeline");
          toast.success(t("Calendar imported"));
        },
      });
      return;
    }
    try {
      const parsed = parseImport(JSON.parse(text));
      if (!parsed) {
        toast.error(t("That file is not a TLNotes backup"));
        return;
      }
      setConfirm({
        title: t("Import data"),
        message: t("Replace your timeline with {notes} and {trash} in the trash?", { notes: parsed.notes.length === 1 ? t("{n} note", { n: parsed.notes.length }) : t("{n} notes", { n: parsed.notes.length }), trash: parsed.trash.length }),
        confirmLabel: t("Import"),
        onConfirm: () => {
          if (!dataRef.current) return;
          patch({ notes: parsed.notes, trash: parsed.trash }, false, true);
          setConfirm(null);
          setFilters(defaultFilters());
          rememberScroll(0);
          skipRestore.current = true;
          setView("timeline");
          requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0 }));
          toast.success(t("Imported"));
        },
      });
    } catch {
      toast.error(t("Could not read that file"));
    }
  }

  const showingSample = data?.notes.some((note) => note.id.startsWith("sample-")) ?? false;
  const editing = data?.notes.find((note) => note.id === editingId) ?? null;
  const filtersActive = !filtersAreDefault(filters);
  const visible = data ? data.notes.filter((note) => !isPageType(note.type) && noteMatches(note, filters)) : [];
  const corpusKey = `${view}:${taskMode}:${filters.types.join(",")}:${filters.tags.join(",")}:${data?.notes.map((note) => `${note.id}:${note.edited}`).join("|") ?? ""}:${data?.trash.map((note) => note.id).join("|") ?? ""}`;
  const searchCorpus = useMemo(() => {
    if (!data) return [];
    if (view === "trash") return data.trash;
    if (view === "settings") return [];
    return taskMode ? visible.filter((note) => note.type === "task") : visible;
  }, [corpusKey]);
  const listed = useMemo(() => {
    const query = filters.search.trim();
    if (!query) return searchCorpus;
    return blendNotes(searchCorpus, rankNotes(searchCorpus, query, { stem: data?.settings.searchStem === true, fuzzy: data?.settings.searchFuzzy === true }), meaningScores);
  }, [searchCorpus, filters.search, data?.settings.searchStem, data?.settings.searchFuzzy, meaningScores]);
  useEffect(() => {
    if (!data) return;
    chooseModel(data.settings.searchModel);
  }, [data?.settings.searchModel]);
  useEffect(() => {
    if (!data || data.settings.searchModel === "off") return;
    const model = data.settings.searchModel;
    const notes = data.notes;
    let started = false;
    const run = () => {
      const now = embedStatus();
      if (started || now.state !== "ready" || now.model !== model) return;
      started = true;
      watchNotes(notes);
    };
    run();
    const stop = subscribeEmbed(run);
    return () => {
      stop();
    };
  }, [data?.settings.searchModel, data?.notes]);
  useEffect(() => {
    const query = filters.search.trim();
    if (!data?.settings.searchMeaning || !query || searchCorpus.length === 0) {
      setMeaningScores((current) => (current.size === 0 ? current : new Map()));
      return;
    }
    const corpus = searchCorpus;
    let cancel = false;
    void scoreMeaning(corpus, query).then((scores) => {
      if (!cancel) setMeaningScores(scores);
    });
    return () => {
      cancel = true;
    };
  }, [filters.search, data?.settings.searchMeaning, data?.settings.searchModel, corpusKey, embed.indexed, embed.state]);
  const composerPlaceholder = taskMode ? t("Write a task…") : t("Write a note…");
  const hasPeriod = visible.some((note) => note.type === "period");
  const visibleKey = visible.map((note) => `${note.id}:${note.edited}`).join("|");

  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root || view !== "timeline" || taskMode) {
      setPlace("");
      return;
    }
    spotsRef.current = collectSpots(root);
    const next = placeFromSpots(spotsRef.current, root.scrollTop);
    setPlace((current) => (current === next ? current : next));
    const observer = new ResizeObserver(() => {
      const current = scrollRef.current;
      if (!current) return;
      spotsRef.current = collectSpots(current);
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [view, taskMode, visibleKey]);

  function resizeInput(element: HTMLTextAreaElement) {
    const cap = 200;
    const length = element.value.length;
    const shrinking = length < draftRef.current.length;
    if (!shrinking && element.clientHeight >= cap) return;
    if (!shrinking && element.scrollHeight <= element.clientHeight + 1) return;
    if (shrinking) element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, cap)}px`;
  }

  function rememberDraft(value: string) {
    const next = value.trim() !== "";
    setHasText((current) => (current === next ? current : next));
    draftRef.current = value;
  }

  function clearComposer() {
    draftRef.current = "";
    setHasText(false);
    const input = inputRef.current;
    if (!input) return;
    input.value = "";
    input.style.height = "auto";
  }

  const nav = data && !locked && (
    <Nav
      float={data.settings.toolbar === "float"}
      view={view}
      taskMode={taskMode && view === "timeline"}
      searching={searchOpen || filters.search.trim() !== ""}
      filtering={filterOpen || (taskMode && view === "timeline" ? taskTags.length > 0 || taskSort !== "order" || showDone : filtersActive)}
      scopeCollapsed={data.settings.scopeCollapsed}
      rightHanded={data.settings.rightHanded}
      onTimeline={goPresent}
      onTasks={() => {
        if (view === "timeline" && taskMode) setTaskMode(false);
        else {
          setTaskMode(true);
          setView("timeline");
        }
      }}
      onSearch={() => setSearchOpen((open) => !open)}
      onFilter={() => setFilterOpen(true)}
      onScope={() => {
        const current = dataRef.current;
        if (!current) return;
        commit({ ...current, settings: { ...current.settings, scopeCollapsed: !current.settings.scopeCollapsed } });
      }}
      onSettings={() => setView("settings")}
    />
  );

  async function finishUnlock(notes: Note[]) {
    const settings = dataRef.current?.settings;
    if (!settings) return;
    const next = await acceptUnlocked(notes, settings);
    applyType(next.settings);
    dataRef.current = next;
    setData(next);
    setLocked(false);
    setDeviceUnlock(hasPasskey());
    rememberJournal(next.notes, next.trash, journalRemoved());
  }

  useLayoutEffect(() => {
    setSyncDoor(syncDoorMode());
  }, []);

  if (syncDoor) return <SyncDoor create={syncDoor === "new"} />;

  return (
    <div className="app-frame flex w-full flex-col overflow-hidden bg-bg text-fg">
      <div id="tl-safe-probe" />
      <Toaster
        theme="light"
        position="top-center"
        toastOptions={{
          style: {
            background: "var(--color-surface)",
            color: "var(--color-fg)",
            border: "1px solid var(--color-border)",
          },
        }}
      />
      <header id="tl-header" className="top-safe mx-auto flex w-full max-w-3xl shrink-0 items-center justify-between gap-3 bg-bg pb-2">
        <h1 ref={trailRef} className="flex min-w-0 items-baseline gap-2 overflow-hidden font-display text-2xl leading-none text-fg">
          <button type="button" data-mark="" aria-label={t("TLNotes")} className="shrink-0 text-xs font-semibold tracking-widest text-muted uppercase hover:text-primary" onClick={goPresent}>
            {compactMark ? "TLN" : "TLNotes"}
          </button>
          {view === "timeline" && !taskMode ? (
            place ? (
              <>
                <span className="shrink-0 text-muted/50">/</span>
                <button type="button" data-crumb="" className="min-w-0 shrink truncate text-left hover:text-primary" onClick={openJump}>
                  {place}
                </button>
              </>
            ) : null
          ) : (
            <>
              <span className="shrink-0 text-muted/50">/</span>
              <span data-crumb="" className="truncate">{view === "settings" ? t("Settings") : view === "trash" ? t("Trash") : t("Tasks")}</span>
            </>
          )}
        </h1>
        {view === "timeline" && filtersActive && (
          <button type="button" className="shrink-0 text-sm font-semibold text-primary" onClick={() => setFilters(defaultFilters())}>
            {t("Clear filters")}
          </button>
        )}
      </header>
      {searchOpen && (
        <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-2">
          <div className="flex items-center gap-2 rounded-full bg-surface px-3 lift">
            <Search className="size-4 shrink-0 text-muted" />
            <input
              ref={searchRef}
              value={filters.search}
              placeholder={
                view === "trash"
                  ? t("Search the trash")
                  : view === "settings"
                    ? t("Search follows the open view")
                    : taskMode
                      ? t("Search tasks")
                      : t("Search the timeline")
              }
              className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSearchOpen(false);
              }}
            />
            <button
              type="button"
              className="inline-flex size-10 items-center justify-center rounded-full text-muted"
              aria-label={t("Clear search")}
              onClick={() => {
                setFilters((current) => ({ ...current, search: "" }));
                setSearchOpen(false);
              }}
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ["searchStem", t("Stem")],
                ["searchFuzzy", t("Fuzzy")],
                ["searchMeaning", t("Meaning")],
              ] as const
            ).map(([key, label]) => {
              const on = data?.settings[key] === true;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  className={on ? "rounded-full bg-primary/15 px-3 py-1.5 text-sm text-fg" : "rounded-full bg-surface px-3 py-1.5 text-sm text-muted"}
                  onClick={() => {
                    const current = dataRef.current;
                    if (!current) return;
                    if (key !== "searchMeaning") {
                      commit({ ...current, settings: { ...current.settings, [key]: !current.settings[key] } });
                      return;
                    }
                    const searchMeaning = !current.settings.searchMeaning;
                    const searchModel = searchMeaning && current.settings.searchModel === "off" ? "e5" : current.settings.searchModel;
                    commit({ ...current, settings: { ...current.settings, searchMeaning, searchModel } });
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {data?.settings.searchMeaning && (
            <p className="mt-2 px-3 text-xs text-muted">
              {embed.state === "error"
                ? tLine(embed.detail) || t("The model did not load.")
                : embed.state !== "ready"
                  ? tLine(embed.detail) || t("Fetching the model…")
                  : embed.total > 0 && embed.indexed < embed.total
                    ? t("Reading the open view") + ` · ${embed.indexed}/${embed.total}`
                    : t("Meaning is included")}
            </p>
          )}
        </div>
      )}
      <div className="relative mx-auto min-h-0 w-full max-w-3xl flex-1">
        <div
          ref={scrollRef}
          className={cn(
            "h-full overflow-y-auto overscroll-contain px-4 [overflow-anchor:none]",
            data?.settings.toolbar === "strip" && "pb-12",
          )}
          data-timeline-scroll
          onScroll={(event) => {
            if (viewRef.current !== "timeline" || taskModeRef.current) return;
            const root = event.currentTarget;
            const top = root.scrollTop;
            if (scrollTimer.current) window.clearTimeout(scrollTimer.current);
            scrollTimer.current = window.setTimeout(() => rememberScroll(top), 400);
            if (placeFrame.current) return;
            placeFrame.current = window.requestAnimationFrame(() => {
              placeFrame.current = 0;
              const nextPlace = placeFromSpots(spotsRef.current, root.scrollTop);
              setPlace((current) => (current === nextPlace ? current : nextPlace));
            });
          }}
        >
          {!data ? (
            <p className="pt-8 text-muted">{t("Opening your timeline…")}</p>
          ) : locked ? (
            <UnlockScreen
              passkey={deviceUnlock}
              onPassphrase={async (phrase) => finishUnlock(await unlockWithSecret(phrase, "passphrase"))}
              onRecovery={async (phrase) => finishUnlock(await unlockWithSecret(phrase, "recovery"))}
              onPasskey={async () => finishUnlock(await unlockWithPasskey())}
            />
          ) : view === "settings" ? (
            <div className="pt-2">
              <SettingsView
                notes={data.notes}
                trash={data.trash}
                rightHanded={data.settings.rightHanded}
                toolbar={data.settings.toolbar}
                rule={data.settings.rule}
                face={data.settings.face}
                typeSize={data.settings.typeSize}
                theme={data.settings.theme}
                scheme={data.settings.scheme}
                language={data.settings.language}
                searchModel={data.settings.searchModel}
                shareEdit={data.settings.shareEdit}
                linkPreviews={data.settings.linkPreviews}
                enterSends={data.settings.enterSends}
                pagePackage={data.settings.pagePackage}
                onPagePackage={(pagePackage) => {
                  const current = dataRef.current;
                  if (!current) return;
                  commit({ ...current, settings: { ...current.settings, pagePackage } });
                }}
                onLinkPreviews={(linkPreviews) => {
                  const current = dataRef.current;
                  if (!current) return;
                  commit({ ...current, settings: { ...current.settings, linkPreviews } });
                }}
                onEnterSends={(enterSends) => {
                  const current = dataRef.current;
                  if (!current) return;
                  commit({ ...current, settings: { ...current.settings, enterSends } });
                }}
                onShareEdit={(shareEdit) => {
                  const current = dataRef.current;
                  if (!current) return;
                  commit({ ...current, settings: { ...current.settings, shareEdit } });
                  toast.success(shareEdit ? t("Shares open in the editor") : t("Shares are added"));
                }}
                onSearchModel={(searchModel: SearchModel) => {
                  const current = dataRef.current;
                  if (!current) return;
                  commit({ ...current, settings: { ...current.settings, searchModel } });
                }}
                onExport={exportJson}
                onExportCalendar={exportCalendar}
                onImport={() => fileRef.current?.click()}
                onClear={clearAll}
                onViewTrash={() => setView("trash")}
                onRestoreAll={restoreAll}
                onEmptyTrash={emptyTrash}
                onToggleHand={() => {
                  const current = dataRef.current;
                  if (!current) return;
                  const rightHanded = !current.settings.rightHanded;
                  commit({ ...current, settings: { ...current.settings, rightHanded } });
                  toast.success(rightHanded ? t("Right-handed layout") : t("Left-handed layout"));
                }}
                onToggleToolbar={() => {
                  const current = dataRef.current;
                  if (!current) return;
                  const toolbar = current.settings.toolbar === "float" ? "strip" : "float";
                  commit({ ...current, settings: { ...current.settings, toolbar } });
                }}
                onRule={(rule) => {
                  const current = dataRef.current;
                  if (!current) return;
                  commit({ ...current, settings: { ...current.settings, rule } });
                }}
                onFace={(face: Face) => {
                  const current = dataRef.current;
                  if (!current) return;
                  commit({ ...current, settings: { ...current.settings, face } });
                }}
                onTheme={(theme: Theme) => {
                  const current = dataRef.current;
                  if (!current) return;
                  commit({ ...current, settings: { ...current.settings, theme } });
                }}
                onScheme={(scheme: Scheme) => {
                  const current = dataRef.current;
                  if (!current) return;
                  commit({ ...current, settings: { ...current.settings, scheme } });
                }}
                onTypeSize={(typeSize: TypeSize) => {
                  const current = dataRef.current;
                  if (!current) return;
                  commit({ ...current, settings: { ...current.settings, typeSize } });
                }}
                onLanguage={(language: string) => {
                  const current = dataRef.current;
                  if (!current) return;
                  commit({ ...current, settings: { ...current.settings, language } });
                }}
                onSample={loadSample}
                sealed={isVaultOn()}
                passkey={deviceUnlock}
                onSeal={async (passphrase) => {
                  const current = dataRef.current;
                  if (!current) throw new Error("The journal is not open.");
                  const recovery = await sealJournal(passphrase, current.notes, current.trash, current.settings);
                  setDeviceUnlock(false);
                  return recovery;
                }}
                onUnseal={() => {
                  setConfirm({
                    title: "Remove the seal",
                    message: t("The notes will sit on this device unsealed."),
                    confirmLabel: t("Remove"),
                    onConfirm: () => {
                      const current = dataRef.current;
                      if (!current) return;
                      void unsealJournal(current.notes, current.trash, current.settings)
                        .then(() => {
                          setDeviceUnlock(false);
                          setConfirm(null);
                          toast.success(t("The seal is removed"));
                        })
                        .catch((error: unknown) => {
                          setConfirm(null);
                          toast.error(error instanceof Error ? tLine(error.message) : t("The seal is still there."));
                        });
                    },
                  });
                  return Promise.resolve();
                }}
                onChangePassphrase={async (passphrase) => {
                  await changePassphrase(passphrase);
                  toast.success(t("Passphrase changed"));
                }}
                onNewRecovery={replaceRecovery}
                onEnrollDevice={async () => {
                  await enrollPasskey();
                  setDeviceUnlock(true);
                  toast.success(t("This device can open the journal"));
                }}
                onRemoveDevice={async () => {
                  await removePasskey();
                  setDeviceUnlock(false);
                  toast.success(t("Device unlock removed"));
                }}
                onLock={async () => {
                  const current = dataRef.current;
                  if (!current) return;
                  savePersisted(current);
                  await whenSaved();
                  const settings = current.settings;
                  lockVault();
                  const hidden = { notes: [], trash: [], settings };
                  dataRef.current = hidden;
                  setData(hidden);
                  setLocked(true);
                  setView("timeline");
                }}
              />
            </div>
          ) : view === "trash" ? (
            <div className="pt-2">
              <TrashView
              trash={data.trash}
              query={filters.search}
              stem={data.settings.searchStem}
              fuzzy={data.settings.searchFuzzy}
              meaning={data.settings.searchMeaning ? meaningScores : noMeaning}
              onBack={() => setView("settings")}
              onRestore={restoreNote}
              onDelete={deleteForever}
            />
            </div>
          ) : data.notes.length === 0 ? (
            <div className="pt-10">
              <h2 className="font-display text-3xl text-balance text-fg">{t("No notes yet")}</h2>
              <p className="mt-2 max-w-md text-pretty text-muted">
                {t("Write below. A draft keeps the time you wrote it. Make it an event to pin a date, or a period to draw a line down the days it covers.")}
              </p>
              <button type="button" className={`${btnPrimary} mt-5`} onClick={loadSample}>
                {t("Load a sample timeline")}
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="pt-10">
              <h2 className="font-display text-3xl text-fg">{t("Nothing matches")}</h2>
              <p className="mt-2 text-pretty text-muted">{t("The notes are still here. The filters are hiding them.")}</p>
              <button type="button" className={`${btnPrimary} mt-5`} onClick={() => setFilters(defaultFilters())}>
                {t("Clear filters")}
              </button>
            </div>
          ) : (
            <div className="pt-2">
              {showingSample && (
                <div className="mb-4 flex items-start justify-between gap-3 rounded-xl bg-surface px-3 py-3 lift">
                  <p className="text-sm text-pretty text-muted">
                    {t("A sample life, so the colored lines have eras to hold. Your notes stay on this device.")}
                  </p>
                  <button type="button" className="shrink-0 text-sm font-semibold text-primary" onClick={removeSample}>
                    {t("Remove")}
                  </button>
                </div>
              )}
              <FilterChips
                filters={filters}
                onSearch={() => setFilters((current) => ({ ...current, search: "" }))}
                onTag={(tag) => setFilters((current) => ({ ...current, tags: current.tags.filter((item) => item !== tag) }))}
                onType={(type) => setFilters((current) => ({ ...current, types: current.types.includes(type) ? current.types : [...current.types, type] }))}
              />
              {filters.search.trim() ? (
                <Timeline
                  notes={listed}
                  query={filters.search}
                  flashId={flashId}
                  scopeCollapsed={data.settings.scopeCollapsed}
                  rightHanded={data.settings.rightHanded}
                  showPeriodHint={false}
                  flat
                  onEdit={setEditingId}
                  onTrash={trashNote}
                  onToggleDone={toggleDone}
                  onToggleTag={(tag) =>
                    setFilters((current) => ({
                      ...current,
                      tags: current.tags.includes(tag) ? current.tags.filter((item) => item !== tag) : [...current.tags, tag],
                    }))
                  }
                />
              ) : taskMode ? (
                <TaskList
                  notes={visible}
                  tasksHidden={!filters.types.includes("task")}
                  query={filters.search}
                  flashId={flashId}
                  showDone={showDone}
                  picked={taskTags}
                  sort={taskSort}
                  onPicked={setTaskTags}
                  onShowDone={setShowDone}
                  onEdit={setEditingId}
                  onTrash={trashNote}
                  onToggleDone={toggleDone}
                  onArrange={arrangeTasks}
                  onMoved={glow}
                  rightHanded={data.settings.rightHanded}
                  toolbar={data.settings.toolbar}
                  onShowTasks={() =>
                    setFilters((current) => ({
                      ...current,
                      types: current.types.includes("task") ? current.types : [...current.types, "task"],
                    }))
                  }
                />
              ) : (
                <Timeline
                  notes={visible}
                  query={filters.search}
                  flashId={flashId}
                  scopeCollapsed={data.settings.scopeCollapsed}
                  rightHanded={data.settings.rightHanded}
                  showPeriodHint={!hasPeriod && !filtersActive}
                  onEdit={setEditingId}
                  onTrash={trashNote}
                  onToggleDone={toggleDone}
                  onToggleTag={(tag) =>
                    setFilters((current) => ({
                      ...current,
                      tags: current.tags.includes(tag) ? current.tags.filter((item) => item !== tag) : [...current.tags, tag],
                    }))
                  }
                />
              )}
            </div>
          )}
        </div>
        {data?.settings.toolbar === "float" && nav}
        {data?.settings.toolbar === "strip" && (
          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0 z-20 flex bg-transparent px-2 py-3",
              data.settings.rightHanded ? "justify-end" : "justify-start",
            )}
          >
            {nav}
          </div>
        )}
      </div>
      {!locked && (
      <form
        id="tl-composer"
        className="composer relative z-10 mx-auto w-full max-w-3xl shrink-0 border-t border-border bg-surface px-3 pt-2"
        onSubmit={(event) => {
          event.preventDefault();
          addNote();
        }}
      >
        <div className="flex items-end gap-2">
          <div className="relative min-w-0 flex-1">
            {(held.image || held.video) && (
              <div className="mb-1 flex items-center gap-2">
                {held.image ? (
                  <span className="relative">
                    <img src={held.image} alt="" className="h-12 w-16 rounded-md object-cover" />
                    <button type="button" className="absolute -top-1 -right-1 inline-flex size-5 items-center justify-center rounded-full bg-fg text-bg" aria-label={t("Remove picture")} onClick={() => setHeld((current) => ({ ...current, image: "" }))}>
                      <X className="size-4" />
                    </button>
                  </span>
                ) : null}
                {held.video ? (
                  <span className="relative">
                    <video src={held.video} muted playsInline className="h-12 w-16 rounded-md bg-bg object-cover" />
                    <button type="button" className="absolute -top-1 -right-1 inline-flex size-5 items-center justify-center rounded-full bg-fg text-bg" aria-label={t("Remove clip")} onClick={() => setHeld((current) => ({ ...current, video: "" }))}>
                      <X className="size-4" />
                    </button>
                  </span>
                ) : null}
              </div>
            )}
            <textarea
              id="noteInput"
              ref={inputRef}
              rows={1}
              placeholder={composerPlaceholder}
              suppressHydrationWarning
              className="max-h-[200px] min-h-11 w-full resize-none bg-transparent py-2.5 pr-11 text-base leading-normal text-fg outline-none placeholder:text-muted"
              onChange={(event) => {
                resizeInput(event.currentTarget);
                rememberDraft(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                const send = data?.settings.enterSends === true ? !event.shiftKey : event.shiftKey;
                if (!send) return;
                event.preventDefault();
                addNote();
              }}
              onPaste={pasteMedia}
            />
            <button
              type="button"
              className="absolute right-0 bottom-0 inline-flex size-11 items-center justify-center text-muted hover:text-fg disabled:opacity-40"
              aria-label={t("Attach a picture or clip")}
              disabled={shrinking}
              onClick={() => mediaRef.current?.click()}
            >
              <Paperclip className="size-4" />
            </button>
          </div>
          <button id="addButton" type="submit" className={btnPrimary} disabled={shrinking || (!hasText && !held.image && !held.video)}>
            {t("Add")}
          </button>
        </div>
      </form>
      )}
      <input
        ref={mediaRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        suppressHydrationWarning
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void attachHeld(file);
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json,text/calendar,.ics"
        className="hidden"
        suppressHydrationWarning
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void onFile(file);
        }}
      />
      <EditorDialog note={editing} corpus={data?.notes ?? []} onClose={() => setEditingId(null)} onSave={saveNote} onTrash={trashNote} />
      <FilterDialog
        open={filterOpen}
        notes={data?.notes ?? []}
        filters={filters}
        taskMode={taskMode && view === "timeline"}
        taskTags={taskTags}
        showDone={showDone}
        taskSort={taskSort}
        onClose={() => setFilterOpen(false)}
        onApply={(next) => {
          setFilters(next);
          setFilterOpen(false);
          toast.success(t("Filters applied"));
        }}
        onApplyTasks={(next) => {
          setTaskTags(next.tags);
          setShowDone(next.showDone);
          setTaskSort(next.sort);
          setFilterOpen(false);
          toast.success(t("Tasks filtered"));
        }}
      />
      <JumpDialog open={jumpOpen} place={place} index={jumpIndex} onClose={() => setJumpOpen(false)} onJump={jumpTo} />
      <ConfirmDialog state={confirm} onCancel={() => setConfirm(null)} />
      <HazardNotice open={hazard} lost={hazardLost} onAck={() => setHazard(false)} />
    </div>
  );
}

function nowOffset(root: HTMLElement) {
  const mark = root.querySelector<HTMLElement>("[data-now]");
  if (!mark) return root.scrollTop;
  const gap = 12;
  const bottom = mark.getBoundingClientRect().bottom - root.getBoundingClientRect().top + root.scrollTop;
  return Math.max(0, bottom - root.clientHeight + gap);
}

function collectMarks(root: HTMLElement) {
  let year = 0;
  const map = new Map<number, string[]>();
  for (const mark of root.querySelectorAll<HTMLElement>("[data-mark]")) {
    if (mark.dataset.mark === "year") {
      year = Number(mark.dataset.label);
      if (!map.has(year)) map.set(year, []);
    } else if (mark.dataset.mark === "month" && year) {
      const label = mark.dataset.label ?? "";
      const months = map.get(year) ?? [];
      if (label && !months.includes(label)) months.push(label);
      map.set(year, months);
    }
  }
  return [...map.entries()].map(([yearNumber, months]) => ({ year: yearNumber, months }));
}

type Spot = { top: number; kind: string; label: string; day: string };

function collectSpots(root: HTMLElement): Spot[] {
  const origin = root.getBoundingClientRect().top - root.scrollTop;
  return [...root.querySelectorAll<HTMLElement>("[data-mark]")].map((mark) => ({
    top: mark.getBoundingClientRect().top - origin,
    kind: mark.dataset.mark ?? "",
    label: mark.dataset.label ?? "",
    day: mark.dataset.day ?? "",
  }));
}

function placeFromSpots(spots: Spot[], scrollTop: number) {
  const edge = scrollTop + 12;
  let year = "";
  let month = "";
  let day = "";
  let seen = false;
  for (const spot of spots) {
    if (spot.top > edge) break;
    seen = true;
    if (spot.kind === "year") {
      year = spot.label;
      month = "";
      day = "";
    } else if (spot.kind === "month") {
      month = spot.label;
      day = "";
    } else if (spot.kind === "day") {
      day = spot.day;
    }
  }
  if (!seen) return spots.find((spot) => spot.kind === "year")?.label ?? "";
  if (!year) return "";
  if (month && day) return `${year} ${month} ${day}`;
  if (month) return `${year} ${month}`;
  return year;
}

function Nav({
  float,
  view,
  taskMode,
  searching,
  filtering,
  scopeCollapsed,
  rightHanded,
  onTimeline,
  onTasks,
  onSearch,
  onFilter,
  onScope,
  onSettings,
}: {
  float: boolean;
  view: View;
  taskMode: boolean;
  searching: boolean;
  filtering: boolean;
  scopeCollapsed: boolean;
  rightHanded: boolean;
  onTimeline: () => void;
  onTasks: () => void;
  onSearch: () => void;
  onFilter: () => void;
  onScope: () => void;
  onSettings: () => void;
}) {
  return (
    <nav
      className={cn(
        "pointer-events-auto gap-1.5 bg-transparent",
        float ? cn("absolute bottom-3 z-20 flex flex-col", rightHanded ? "nav-float-right" : "nav-float-left") : "flex",
      )}
      aria-label={t("Timeline navigation")}
    >
      <NavButton label="Present" active={view === "timeline" && !taskMode} onClick={onTimeline}>
        <Home className="size-5" />
      </NavButton>
      <NavButton label="Tasks" active={taskMode} onClick={onTasks}>
        <ListTodo className="size-5" />
      </NavButton>
      {view !== "settings" && (
        <NavButton label="Search" active={searching} onClick={onSearch}>
          <Search className="size-5" />
        </NavButton>
      )}
      {view === "timeline" && (
        <NavButton label={taskMode ? "Filter tasks" : "Filter by tags and type"} active={filtering} onClick={onFilter}>
          <Filter className="size-5" />
        </NavButton>
      )}
      {view === "timeline" && !taskMode && (
        <NavButton label={scopeCollapsed ? "Show scope column" : "Hide scope column"} active={false} onClick={onScope}>
          {scopeCollapsed ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
        </NavButton>
      )}
      {view !== "settings" && view !== "trash" && (
        <NavButton label="Settings" active={false} onClick={onSettings}>
          <Settings className="size-5" />
        </NavButton>
      )}
    </nav>
  );
}

function NavButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={t(label)}
      aria-label={t(label)}
      aria-pressed={active}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full lift",
        active ? "bg-primary text-primary-fg" : "bg-surface text-fg",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function FilterChips({
  filters,
  onSearch,
  onTag,
  onType,
}: {
  filters: Filters;
  onSearch: () => void;
  onTag: (tag: string) => void;
  onType: (type: string) => void;
}) {
  const hidden = TIMELINE_TYPES.filter((type) => !filters.types.includes(type));
  if (!filters.search.trim() && filters.tags.length === 0 && hidden.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {filters.search.trim() && <Chip onClear={onSearch}>{t("Search")}: {filters.search.trim()}</Chip>}
      {filters.tags.map((tag) => (
        <Chip key={tag} onClear={() => onTag(tag)}>
          {tag}
        </Chip>
      ))}
      {hidden.map((type) => (
        <Chip key={type} onClear={() => onType(type)}>
          {t("Hiding {type}", { type: typeLabel(type) })}
        </Chip>
      ))}
    </div>
  );
}

function Chip({ children, onClear }: { children: ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex h-8 items-center gap-1 rounded-full bg-primary pr-1 pl-3 text-xs font-medium text-primary-fg">
      {children}
      <button type="button" className="inline-flex size-6 items-center justify-center rounded-full bg-primary-fg/20" aria-label={t("Remove filter")} onClick={onClear}>
        <X className="size-3" />
      </button>
    </span>
  );
}
