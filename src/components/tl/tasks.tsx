import { useEffect, useRef, useState, type PointerEvent } from "react";
import { GripVertical, Info } from "lucide-react";
import { getPartialDateTime, isSpan, type Note } from "@/lib/tl/model";
import { t } from "@/lib/tl/i18n";
import { NoteCard } from "@/components/tl/note-card";
import { cn } from "@/components/tl/ui";

type Place = "before" | "after" | "into";
type Hint = { id: string; place: Place };
type Move = { id: string; parentId: string | null; rank: number };
export type TaskSort = "order" | "edited" | "added";

export function TaskList({
  notes,
  tasksHidden,
  query,
  flashId,
  showDone,
  picked,
  sort,
  onPicked,
  onShowDone,
  onEdit,
  onTrash,
  onToggleDone,
  onArrange,
  onMoved,
  onShowTasks,
  rightHanded,
  toolbar,
}: {
  notes: Note[];
  tasksHidden: boolean;
  query: string;
  flashId: string | null;
  showDone: boolean;
  picked: string[];
  sort: TaskSort;
  onPicked: (tags: string[]) => void;
  onShowDone: (show: boolean) => void;
  onEdit: (id: string) => void;
  onTrash: (id: string) => void;
  onToggleDone: (id: string) => void;
  onArrange: (updates: Move[]) => void;
  onMoved: (id: string) => void;
  onShowTasks: () => void;
  rightHanded: boolean;
  toolbar: "float" | "strip";
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);
  const [how, setHow] = useState(false);
  const drag = useRef<{ id: string; pointer: number } | null>(null);
  const hintRef = useRef<Hint | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const hold = useRef<(() => void) | null>(null);
  const release = useRef<(() => void) | null>(null);

  useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const stopSelect = (event: Event) => event.preventDefault();
    const stopCallout = (event: TouchEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-grip]")) event.preventDefault();
      window.getSelection()?.removeAllRanges();
    };
    root.addEventListener("selectstart", stopSelect);
    root.addEventListener("contextmenu", stopSelect);
    root.addEventListener("touchstart", stopCallout, { passive: false });
    return () => {
      root.removeEventListener("selectstart", stopSelect);
      root.removeEventListener("contextmenu", stopSelect);
      root.removeEventListener("touchstart", stopCallout);
    };
  }, [tasksHidden]);

  useEffect(() => () => {
    hold.current?.();
    release.current?.();
  }, []);

  if (tasksHidden) {
    return (
      <div className="pt-8">
        <h2 className="font-display text-3xl text-fg">{t("Tasks are hidden")}</h2>
        <p className="mt-2 text-pretty text-muted">{t("The type filter is leaving them out of this list.")}</p>
        <button type="button" className="mt-5 text-sm font-semibold text-primary" onClick={onShowTasks}>
          Show tasks
        </button>
      </div>
    );
  }

  const tasks = notes.filter((note) => note.type === "task");
  const tags = [...new Set(tasks.flatMap((note) => note.tags))].sort((a, b) => a.localeCompare(b));
  const active = picked.filter((tag) => tags.includes(tag));
  const matches = (note: Note) => active.every((tag) => note.tags.includes(tag));
  const order = orderOf(sort);
  const open = tasks.filter((note) => !note.done && matches(note)).sort(order);
  const done = tasks.filter((note) => note.done && matches(note)).sort(order);
  const openIds = new Set(open.map((note) => note.id));
  const underOpen = new Set<string>();
  const claim = (id: string) => {
    for (const note of done) {
      if (note.parentId === id && !underOpen.has(note.id)) {
        underOpen.add(note.id);
        claim(note.id);
      }
    }
  };
  for (const id of openIds) claim(id);
  const openPool = [...open, ...done.filter((note) => underOpen.has(note.id))];
  const donePool = done.filter((note) => !underOpen.has(note.id));
  const openAll = tasks.some((note) => !note.done);

  function remember(next: Hint | null) {
    const prev = hintRef.current;
    if (prev === next || (prev && next && prev.id === next.id && prev.place === next.place)) return;
    hintRef.current = next;
    setHint(next);
  }

  function toggleTag(tag: string) {
    onPicked(picked.includes(tag) ? picked.filter((item) => item !== tag) : [...picked, tag]);
  }

  function placeGhost(x: number, y: number, text?: string) {
    const node = ghostRef.current;
    if (!node) return;
    if (text != null) node.textContent = text;
    node.hidden = false;
    node.style.transform = `translate3d(${x + 16}px, ${y + 16}px, 0)`;
  }

  function stopDrag() {
    const done = release.current;
    release.current = null;
    drag.current = null;
    done?.();
    setDragging(null);
    if (ghostRef.current) ghostRef.current.hidden = true;
    remember(null);
  }

  function lockScroll() {
    let root = listRef.current?.parentElement ?? null;
    while (root && !root.hasAttribute("data-timeline-scroll")) root = root.parentElement;
    const block = (event: TouchEvent) => event.preventDefault();
    document.addEventListener("touchmove", block, { passive: false });
    const previous = root?.style.overflow ?? "";
    if (root) root.style.overflow = "hidden";
    return () => {
      document.removeEventListener("touchmove", block);
      if (root) root.style.overflow = previous;
    };
  }

  function startDrag(note: Note, pointer: number, x: number, y: number) {
    const unlock = lockScroll();
    drag.current = { id: note.id, pointer };
    setDragging(note.id);
    placeGhost(x, y, note.content.split("\n")[0]?.trim() || "Task");
    const move = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== pointer) return;
      if (event.cancelable) event.preventDefault();
      placeGhost(event.clientX, event.clientY);
      const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-task-id]");
      const id = hit?.dataset.taskId;
      if (!id || id === note.id) {
        remember(null);
        return;
      }
      const rect = hit.getBoundingClientRect();
      const ratio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
      remember({ id, place: ratio < 0.28 ? "before" : ratio > 0.72 ? "after" : "into" });
    };
    const end = (event: globalThis.PointerEvent) => {
      if (!drag.current || event.pointerId !== pointer) return;
      const target = hintRef.current;
      stopDrag();
      if (target) placeTask(note.id, target);
    };
    release.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      unlock();
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  function armHold(event: PointerEvent<HTMLElement>, note: Note) {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest("[data-no-press]")) return;
    hold.current?.();
    const pointer = event.pointerId;
    const originX = event.clientX;
    const originY = event.clientY;
    let x = originX;
    let y = originY;
    const timer = window.setTimeout(() => {
      window.removeEventListener("pointermove", track);
      window.removeEventListener("pointerup", cancel);
      window.removeEventListener("pointercancel", cancel);
      hold.current = null;
      startDrag(note, pointer, x, y);
    }, 650);
    const track = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== pointer) return;
      x = ev.clientX;
      y = ev.clientY;
      if (Math.hypot(x - originX, y - originY) > 10) cancel();
    };
    const cancel = () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", track);
      window.removeEventListener("pointerup", cancel);
      window.removeEventListener("pointercancel", cancel);
      if (hold.current === cancel) hold.current = null;
    };
    hold.current = cancel;
    window.addEventListener("pointermove", track);
    window.addEventListener("pointerup", cancel);
    window.addEventListener("pointercancel", cancel);
  }

  function placeTask(id: string, target: Hint) {
    const moving = tasks.find((note) => note.id === id);
    const onto = tasks.find((note) => note.id === target.id);
    if (!moving || !onto) return;
    const ids = new Set(tasks.map((note) => note.id));
    if (target.place === "into") {
      if (wouldCycle(id, onto.id, tasks)) return;
      const kids = tasks.filter((note) => note.parentId === onto.id && note.id !== id);
      const rank = kids.reduce((max, note) => Math.max(max, note.rank ?? -1), -1) + 1;
      onArrange([{ id, parentId: onto.id, rank }]);
      onMoved(id);
      return;
    }
    const parentId = onto.parentId && ids.has(onto.parentId) && onto.parentId !== id ? onto.parentId : null;
    if (parentId && wouldCycle(id, parentId, tasks)) return;
    const siblings = tasks.filter((note) => (note.parentId && ids.has(note.parentId) ? note.parentId : null) === parentId && note.id !== id).sort(byRank);
    const index = siblings.findIndex((note) => note.id === onto.id);
    if (index < 0) return;
    siblings.splice(target.place === "before" ? index : index + 1, 0, moving);
    onArrange(siblings.map((note, rank) => ({ id: note.id, parentId, rank })));
    onMoved(id);
  }

  function branch(pool: Note[], note: Note, depth: number) {
    const kids = pool.filter((item) => item.parentId === note.id).sort(order);
    const mark = hint?.id === note.id ? hint.place : null;
    return (
      <div key={note.id} className={depth > 0 ? "mt-2 ml-4 border-l border-border pl-3" : undefined}>
        <div
          data-task-id={note.id}
          className={cn(
            "flex items-stretch rounded-xl",
            dragging === note.id && "pointer-events-none opacity-40",
            mark === "into" && "ring-2 ring-primary",
            mark === "before" && "border-t-2 border-primary",
            mark === "after" && "border-b-2 border-primary",
          )}
          onPointerDown={(event) => armHold(event, note)}
        >
          <span className="flex w-5 shrink-0 items-center justify-center text-muted" aria-hidden>
            <GripVertical className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <NoteCard
              note={note}
              query={query}
              flash={flashId === note.id}
              plain
              holdToMove
              onEdit={onEdit}
              onTrash={onTrash}
              onToggleTag={() => {}}
              onToggleDone={onToggleDone}
            />
          </div>
        </div>
        {kids.map((child) => branch(pool, child, depth + 1))}
      </div>
    );
  }

  const openRoots = roots(openPool, order);
  const doneRoots = roots(donePool, order);

  return (
    <div
      ref={listRef}
      className={cn("task-list pb-28", toolbar === "float" && (rightHanded ? "task-clear-right" : "task-clear-left"))}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="flex items-center gap-1">
        <p className="text-sm text-muted tabular-nums">
          {open.length === 1 ? t("1 open") : t("{n} open", { n: open.length })}
          {done.length > 0 ? ` · ${done.length === 1 ? t("1 done") : t("{n} done", { n: done.length })}` : ""}
        </p>
        <button
          type="button"
          className="inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-fg"
          aria-label={t("About arranging tasks")}
          aria-expanded={how}
          onClick={() => setHow((open) => !open)}
        >
          <Info className="size-4" strokeWidth={2.25} />
        </button>
      </div>
      {how ? <p className="mt-1 text-sm text-pretty text-muted">{t("Drag a task by the bar at its edge. Drop it on another to nest it.")}</p> : null}
      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const on = active.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                className={
                  on
                    ? "tag-toggle rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-fg"
                    : "tag-toggle rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                }
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            );
          })}
        </div>
      )}
      {openRoots.length === 0 ? (
        <div className="pt-6">
          <h2 className="font-display text-3xl text-balance text-fg">{active.length > 0 && openAll ? t("None with these tags") : t("Nothing open")}</h2>
          <p className="mt-2 max-w-md text-pretty text-muted">
            {active.length > 0 && openAll
              ? t("Turn a tag off to widen the list.")
              : t("Write below to add a task, or edit any note and set its type to Task.")}
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">{openRoots.map((note) => branch(openPool, note, 0))}</div>
      )}
      {donePool.length > 0 && (
        <section className="mt-6">
          <div className={rightHanded ? "mb-2 flex items-center justify-start gap-3" : "mb-2 flex items-center justify-end gap-3"}>
            <h2 className="text-xs font-semibold tracking-widest text-muted uppercase">{t("Done")}</h2>
            <button type="button" className="text-sm font-semibold text-primary" onClick={() => onShowDone(!showDone)}>
              {showDone ? t("Hide") : t("Show")}
            </button>
          </div>
          {showDone && <div className="flex flex-col gap-2">{doneRoots.map((note) => branch(donePool, note, 0))}</div>}
        </section>
      )}
      <div
        ref={ghostRef}
        hidden
        className="pointer-events-none fixed top-0 left-0 z-50 max-w-56 truncate rounded-lg bg-fg px-3 py-2 text-sm text-bg shadow-lg"
      />
    </div>
  );
}

function roots(pool: Note[], order: (a: Note, b: Note) => number) {
  const ids = new Set(pool.map((note) => note.id));
  return pool.filter((note) => !note.parentId || !ids.has(note.parentId)).sort(order);
}

function wouldCycle(id: string, parentId: string, tasks: Note[]) {
  const parent = new Map(tasks.map((note) => [note.id, note.parentId]));
  let current: string | undefined = parentId;
  const seen = new Set<string>();
  while (current) {
    if (current === id) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    current = parent.get(current);
  }
  return false;
}

function dueTime(note: Note) {
  if (!note.date || isSpan(note.date) || note.date.year == null) return null;
  return getPartialDateTime(note.date, note.created);
}

function orderOf(sort: TaskSort) {
  return (a: Note, b: Note) => {
    if (sort === "edited") return b.edited - a.edited || byRank(a, b);
    if (sort === "added") return a.created - b.created || byRank(a, b);
    return byRank(a, b);
  };
}

function byRank(a: Note, b: Note) {
  const ar = a.rank;
  const br = b.rank;
  if (ar != null && br != null && ar !== br) return ar - br;
  if (ar != null && br == null) return -1;
  if (ar == null && br != null) return 1;
  return compareOpen(a, b);
}

function compareOpen(a: Note, b: Note) {
  const dueA = dueTime(a);
  const dueB = dueTime(b);
  if (dueA == null && dueB == null) return a.created - b.created;
  if (dueA == null) return 1;
  if (dueB == null) return -1;
  if (dueA !== dueB) return dueA - dueB;
  return a.created - b.created;
}
