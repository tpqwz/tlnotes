import * as Dialog from "@radix-ui/react-dialog";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { highlightParts } from "@/lib/tl/model";
import { t } from "@/lib/tl/i18n";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const btnPrimary =
  "plaque plaque-fill inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";

export const btnGhost =
  "plaque inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-fg hover:bg-bg disabled:opacity-40";

export const btnInk =
  "plaque plaque-fill inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-fg px-4 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-40";

export const btnSurface =
  "plaque inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-surface px-4 text-sm font-semibold text-fg lift";

export function InfoButton({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-fg"
        aria-label={`About ${title}`}
        onClick={() => setOpen(true)}
      >
        <Info className="size-4" strokeWidth={2.25} />
      </button>
      <Modal open={open} onOpenChange={setOpen} title={title} band>
        <p className="text-base leading-relaxed text-pretty text-muted">{text}</p>
      </Modal>
    </>
  );
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  info,
  seat = "high",
  children,
  level = 0,
  band = false,
  room = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  info?: string;
  seat?: "high" | "low" | "hand";
  children: ReactNode;
  level?: number;
  band?: boolean;
  room?: boolean;
}) {
  const [tip, setTip] = useState(false);
  const z = level > 0 ? "z-[70]" : "z-50";
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) setTip(false);
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={`fixed inset-0 ${z} bg-fg/40`} />
        <Dialog.Content
          className={
            band
              ? `info-panel ${z} focus:outline-none`
              : room
                ? `modal-panel modal-room ${z} flex flex-col overflow-hidden rounded-2xl bg-surface focus:outline-none`
                : `modal-panel fixed inset-x-3 ${z} mx-auto flex max-w-lg flex-col overflow-hidden rounded-2xl bg-surface focus:outline-none ${seat === "low" ? "modal-low" : seat === "hand" ? "modal-hand" : "top-10"}`
          }
        >
          <div className="flex items-start justify-between gap-4 px-5 pt-5">
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <Dialog.Title className="font-display text-3xl leading-none text-fg">{title}</Dialog.Title>
                {info ? (
                  <button
                    type="button"
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-fg"
                    aria-label={`About ${title}`}
                    aria-expanded={tip}
                    onClick={() => setTip((open) => !open)}
                  >
                    <Info className="size-4" strokeWidth={2.25} />
                  </button>
                ) : null}
              </div>
              {description ? (
                <Dialog.Description className="mt-2 text-sm text-pretty text-muted">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
              {info && tip ? <p className="mt-3 text-sm text-pretty text-muted">{info}</p> : null}
            </div>
            <Dialog.Close
              className="inline-flex size-11 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-fg"
              aria-label={t("Close")}
            >
              <span aria-hidden className="text-xl leading-none">
                ×
              </span>
            </Dialog.Close>
          </div>
          <div className={room ? "flex min-h-0 flex-1 flex-col overflow-hidden px-5 pt-4 pb-5" : "min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-5"}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function Highlight({ text, query }: { text: string; query: string }) {
  const parts = highlightParts(text, query);
  return (
    <>
      {parts.map((part, index) =>
        part.hit ? (
          <mark key={index} className="hit">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}
