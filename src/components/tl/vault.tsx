import { useEffect, useState, type FormEvent } from "react";
import { btnInk, btnPrimary, btnSurface, InfoButton, Modal } from "@/components/tl/ui";
import { t, tLine } from "@/lib/tl/i18n";
import { deviceUnlockAvailable, passphraseStrength } from "@/lib/tl/vault";

export function UnlockScreen({
  passkey,
  onPassphrase,
  onRecovery,
  onPasskey,
}: {
  passkey: boolean;
  onPassphrase: (phrase: string) => Promise<void>;
  onRecovery: (phrase: string) => Promise<void>;
  onPasskey: () => Promise<void>;
}) {
  const [phrase, setPhrase] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (recovery) await onRecovery(phrase);
      else await onPassphrase(phrase);
    } catch (caught) {
      setError(caught instanceof Error ? tLine(caught.message) : t("The journal did not open."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mx-auto max-w-md pt-16" autoComplete="on" onSubmit={(event) => void submit(event)}>
        <h2 className="font-display text-4xl text-fg">{t("Sealed")}</h2>
      <p className="mt-3 text-pretty text-muted">
        {recovery ? t("Enter the recovery key you wrote down.") : t("The notes stay sealed until the passphrase opens them.")}
      </p>
      {recovery ? (
        <label className="mt-6 flex flex-col gap-1.5 text-sm font-medium text-fg">
          {t("Recovery key")}
          <input
            name="recovery"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            className="field"
            value={phrase}
            autoFocus
            onChange={(event) => setPhrase(event.target.value)}
          />
        </label>
      ) : (
        <>
          <label className="mt-6 flex flex-col gap-1.5 text-sm font-medium text-fg">
            {t("Journal")}
            <input name="username" type="text" autoComplete="username" className="field" value="TLNotes" readOnly />
          </label>
          <label className="mt-3 flex flex-col gap-1.5 text-sm font-medium text-fg">
            {t("Passphrase")}
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              className="field"
              value={phrase}
              autoFocus
              onChange={(event) => setPhrase(event.target.value)}
            />
          </label>
        </>
      )}
      {error && <p className="mt-3 text-sm text-pretty text-primary">{error}</p>}
      <div className="mt-4 flex flex-col gap-2">
        <button type="submit" className={btnPrimary} disabled={busy || phrase.trim() === ""}>
          {busy ? t("Opening…") : t("Open")}
        </button>
        {passkey && !recovery && (
          <button
            type="button"
            className={btnSurface}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError("");
              void onPasskey()
                .catch((caught) => setError(caught instanceof Error ? tLine(caught.message) : t("The journal did not open.")))
                .finally(() => setBusy(false));
            }}
          >
            {t("Use this device")}
          </button>
        )}
        <button
          type="button"
          className="self-start text-sm font-semibold text-primary"
          onClick={() => {
            setRecovery((on) => !on);
            setPhrase("");
            setError("");
          }}
        >
          {recovery ? t("Use the passphrase") : t("Use the recovery key")}
        </button>
      </div>
    </form>
  );
}

export function SealSection({
  sealed,
  passkey,
  onSeal,
  onUnseal,
  onChange,
  onRecovery,
  onEnroll,
  onRemoveDevice,
  onLock,
}: {
  sealed: boolean;
  passkey: boolean;
  onSeal: (passphrase: string) => Promise<string>;
  onUnseal: () => Promise<void>;
  onChange: (passphrase: string) => Promise<void>;
  onRecovery: () => Promise<string>;
  onEnroll: () => Promise<void>;
  onRemoveDevice: () => Promise<void>;
  onLock: () => Promise<void>;
}) {
  const [device, setDevice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sealOpen, setSealOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [again, setAgain] = useState("");
  const [shown, setShown] = useState("");
  const [mode, setMode] = useState<"seal" | "change" | "recovery">("seal");

  useEffect(() => {
    void deviceUnlockAvailable().then(setDevice);
  }, []);

  function close() {
    setSealOpen(false);
    setPhrase("");
    setAgain("");
    setError("");
  }

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (caught) {
      setError(caught instanceof Error ? tLine(caught.message) : t("That did not work."));
    } finally {
      setBusy(false);
    }
  }

  const strength = passphraseStrength(phrase);

  return (
    <section id="settings-seal" className="mt-5 scroll-mt-28 border-t border-border pt-5">
      <div className="flex items-center gap-1">
        <h2 className="font-display text-2xl text-fg">{t("Seal")}</h2>
        <InfoButton
          title={t("Seal")}
          text={t("Optional. A passphrase seals the notes on this device, and a recovery key is shown once. Fingerprint, face, or PIN can be added afterwards. It is never the only way in.")}
        />
      </div>
      {error && !sealOpen && <p className="mt-3 text-sm text-pretty text-primary">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {!sealed ? (
          <button
            type="button"
            className={btnPrimary}
            onClick={() => {
              setMode("seal");
              setShown("");
              setSealOpen(true);
            }}
          >
            {t("Seal the journal")}
          </button>
        ) : (
          <>
            {(device || passkey) && (
              <button
                type="button"
                className={btnSurface}
                disabled={busy}
                onClick={() => void run(passkey ? onRemoveDevice : onEnroll)}
              >
                {passkey ? t("Remove unlock") : t("Add unlock")}
              </button>
            )}
            <button
              type="button"
              className={btnSurface}
              onClick={() => {
                setMode("change");
                setShown("");
                setSealOpen(true);
              }}
            >
              {t("Change passphrase")}
            </button>
            <button
              type="button"
              className={btnSurface}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setShown(await onRecovery());
                  setMode("recovery");
                  setSealOpen(true);
                })
              }
            >
              {t("New recovery key")}
            </button>
            <button type="button" className={btnSurface} disabled={busy} onClick={() => void run(onLock)}>
              {t("Lock now")}
            </button>
            <button type="button" className={btnInk} disabled={busy} onClick={() => void run(onUnseal)}>
              {t("Remove the seal")}
            </button>
          </>
        )}
      </div>
      <Modal
        open={sealOpen}
        onOpenChange={(open) => {
          if (!open) close();
          else setSealOpen(true);
        }}
        title={mode === "recovery" ? t("Recovery key") : mode === "change" ? t("New passphrase") : t("Seal the journal")}
        description={
          mode === "recovery"
            ? t("Write this down. It is not shown again, and the previous recovery key no longer works.")
            : mode === "change"
              ? t("The notes stay sealed. Only the passphrase changes.")
              : t("If the passphrase is lost, only the recovery key can open the notes.")
        }
      >
        {shown ? (
          <div>
            <p className="font-display text-2xl tracking-wide break-all text-fg">{shown}</p>
            <button type="button" className={`${btnPrimary} mt-5`} onClick={close}>
              {t("I have written it down")}
            </button>
          </div>
        ) : (
          <form
            autoComplete="on"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                if (phrase !== again) throw new Error("The two entries do not match.");
                if (mode === "change") {
                  await onChange(phrase);
                  close();
                  return;
                }
                setShown(await onSeal(phrase));
                setPhrase("");
                setAgain("");
              });
            }}
          >
            <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
              {t("Journal")}
              <input name="username" type="text" autoComplete="username" className="field" value="TLNotes" readOnly />
            </label>
            <label className="mt-3 flex flex-col gap-1.5 text-sm font-medium text-fg">
              {t("Passphrase")}
              <input
                name="new-password"
                type="password"
                autoComplete="new-password"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                className="field"
                value={phrase}
                autoFocus
                onChange={(event) => setPhrase(event.target.value)}
              />
            </label>
            {strength && (
              <p className="mt-2 text-sm text-pretty text-muted">
                <span className="text-fg">{t(strength.title)}.</span> {t(strength.note)}
              </p>
            )}
            <label className="mt-3 flex flex-col gap-1.5 text-sm font-medium text-fg">
              {t("Repeat the passphrase")}
              <input
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
                className="field"
                value={again}
                onChange={(event) => setAgain(event.target.value)}
              />
            </label>
            {error && <p className="mt-3 text-sm text-pretty text-primary">{error}</p>}
            <button type="submit" className={`${btnPrimary} mt-4`} disabled={busy || phrase.trim() === ""}>
              {busy ? t("Sealing…") : mode === "change" ? t("Change") : t("Seal")}
            </button>
          </form>
        )}
      </Modal>
    </section>
  );
}
