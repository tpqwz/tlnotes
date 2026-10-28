import type { Note } from "@/lib/tl/model";
import { journalFingerprint, canonicalNotes } from "@/lib/tl/journal";
import {
  readJournal,
  writeJournal,
  writeRecords,
  writeVault,
  type SealedRecord,
  type VaultRecord,
  type Wrapped,
} from "@/lib/tl/idb";
import type { Settings } from "@/lib/tl/storage";

export function passphraseStrength(phrase: string): { title: string; note: string } | null {
  const text = phrase.trim();
  if (!text) return null;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^\da-zA-Z\s]/].filter((pattern) => pattern.test(text)).length;
  const sentence = /\s/.test(text) && text.length >= 12;
  if (text.length < 8) return { title: "Insecure", note: "Short enough to guess. A sentence is much harder." };
  if (text.length < 12 || (kinds < 2 && !sentence)) return { title: "Light", note: "It stops a glance. It will not stop someone trying words." };
  if (sentence || text.length >= 20) return { title: "Strong", note: "A long phrase is the sort of secret that holds." };
  return { title: "Sound", note: "Reasonable. A full sentence would be stronger." };
}

function requirePassphrase(passphrase: string) {
  if (passphrase.trim() === "") throw new Error("Enter a passphrase.");
}

export const KDF_ITERATIONS = 600_000;

const RECOVERY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

let session: CryptoKey | null = null;
let vaultOn = false;
let passkeyOn = false;

export function isVaultOn() {
  return vaultOn;
}

export function hasPasskey() {
  return passkeyOn;
}

export function sessionKey() {
  return session;
}

const SESSION = "tlnotes.session";

function forgetSession() {
  session = null;
  try {
    sessionStorage.removeItem(SESSION);
  } catch {
    /* a private window may refuse storage */
  }
}

async function holdSession() {
  if (!session) return;
  try {
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", session));
    sessionStorage.setItem(SESSION, bytesToB64(raw));
    raw.fill(0);
  } catch {
    /* this visit still stays open; a refresh would ask again */
  }
}

export async function restoreSession() {
  if (session) return true;
  let saved = "";
  try {
    saved = sessionStorage.getItem(SESSION) ?? "";
  } catch {
    return false;
  }
  if (!saved) return false;
  try {
    session = await importAes(b64ToBytes(saved), true);
    return true;
  } catch {
    forgetSession();
    return false;
  }
}

export function lockVault() {
  forgetSession();
}

export function noteVault(record: VaultRecord | null) {
  vaultOn = record != null;
  passkeyOn = record?.passkey != null;
}

function bytesToB64(bytes: Uint8Array) {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

function b64ToBytes(value: string) {
  const text = atob(value);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
  return bytes;
}

function bytesToB64Url(bytes: Uint8Array) {
  return bytesToB64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function encodeRecovery(bytes: Uint8Array) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += RECOVERY_ALPHABET[(value >> bits) & 31];
    }
  }
  if (bits > 0) out += RECOVERY_ALPHABET[(value << (5 - bits)) & 31];
  return out.match(/.{1,4}/g)?.join(" ") ?? out;
}

export function decodeRecovery(text: string) {
  const clean = text
    .toUpperCase()
    .replaceAll("O", "0")
    .replaceAll("I", "1")
    .replaceAll("L", "1")
    .replace(/[^0-9A-Z]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = RECOVERY_ALPHABET.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 255);
    }
  }
  return new Uint8Array(bytes);
}

function copyBytes(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

async function importAes(raw: Uint8Array, extractable = false) {
  return crypto.subtle.importKey("raw", copyBytes(raw), "AES-GCM", extractable, ["encrypt", "decrypt"]);
}

async function derivePassphrase(passphrase: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: copyBytes(salt), iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function wrapRaw(raw: Uint8Array, key: CryptoKey): Promise<Wrapped> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: copyBytes(iv) }, key, copyBytes(raw));
  return { iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) };
}

async function unwrapRaw(wrapped: Wrapped, key: CryptoKey) {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: copyBytes(b64ToBytes(wrapped.iv)) },
    key,
    copyBytes(b64ToBytes(wrapped.ct)),
  );
  return new Uint8Array(plain);
}

async function recoveryAes(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", copyBytes(bytes));
  return importAes(new Uint8Array(digest));
}

async function dataKeyFrom(raw: Uint8Array) {
  return importAes(raw, true);
}

export async function sealNote(note: Note, key: CryptoKey): Promise<SealedRecord> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: copyBytes(iv) },
    key,
    new TextEncoder().encode(JSON.stringify(note)),
  );
  return { id: note.id, sealed: true, iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) };
}

export async function openSealed(record: SealedRecord, key: CryptoKey): Promise<Note> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: copyBytes(b64ToBytes(record.iv)) },
    key,
    copyBytes(b64ToBytes(record.ct)),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as Note;
}

export async function sealAll(notes: Note[], trash: Note[], key: CryptoKey) {
  const live = await Promise.all(notes.map((note) => sealNote(note, key)));
  const gone = await Promise.all(trash.map((note) => sealNote(note, key)));
  return [...live, ...gone];
}

async function currentVault() {
  const record = await readJournal();
  if (!record.vault) throw new Error("This journal is not sealed.");
  return record;
}

export async function sealJournal(passphrase: string, notes: Note[], trash: Note[], settings: Settings) {
  requirePassphrase(passphrase);
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passKey = await derivePassphrase(passphrase, salt, KDF_ITERATIONS);
  const recoveryRaw = crypto.getRandomValues(new Uint8Array(20));
  const vault: VaultRecord = {
    v: 1,
    kdf: { salt: bytesToB64(salt), iterations: KDF_ITERATIONS },
    passphrase: await wrapRaw(raw, passKey),
    recovery: await wrapRaw(raw, await recoveryAes(recoveryRaw)),
    passkey: null,
  };
  const key = await dataKeyFrom(raw);
  const sealed = await sealAll(notes, trash, key);
  const journal = await readJournal();
  await writeRecords(sealed, settings, journal.removed, true);
  await writeVault(vault);
  const back = await readJournal();
  try {
    const opened = await Promise.all(back.sealed.map((item) => openSealed(item, key)));
    const wanted = journalFingerprint(canonicalNotes(notes, trash));
    const found = journalFingerprint(canonicalNotes(opened.filter((note) => !note.trashedAt), opened.filter((note) => note.trashedAt)));
    if (wanted !== found) throw new Error("mismatch");
  } catch (error) {
    await writeJournal(notes, trash, settings, journal.removed, true);
    await writeVault(null);
    session = null;
    vaultOn = false;
    passkeyOn = false;
    forgetSession();
    if (error instanceof Error && error.message === "mismatch") throw new Error("The seal could not be checked. The journal is unchanged.");
    throw error;
  }
  raw.fill(0);
  session = key;
  void holdSession();
  vaultOn = true;
  passkeyOn = false;
  return encodeRecovery(recoveryRaw);
}

export async function unlockWithSecret(secret: string, kind: "passphrase" | "recovery") {
  const record = await currentVault();
  const vault = record.vault;
  if (!vault) throw new Error("This journal is not sealed.");
  try {
    const wrapping =
      kind === "passphrase"
        ? await derivePassphrase(secret, b64ToBytes(vault.kdf.salt), vault.kdf.iterations)
        : await recoveryAes(decodeRecovery(secret));
    const wrapped = kind === "passphrase" ? vault.passphrase : vault.recovery;
    const raw = await unwrapRaw(wrapped, wrapping);
    session = await dataKeyFrom(raw);
    raw.fill(0);
    void holdSession();
  } catch {
    forgetSession();
    throw new Error(kind === "passphrase" ? "That passphrase does not open this journal." : "That recovery key does not open this journal.");
  }
  vaultOn = true;
  passkeyOn = vault.passkey != null;
  const key = session;
  if (!key) throw new Error("The journal did not open.");
  const notes = await Promise.all(record.sealed.map((item) => openSealed(item, key)));
  return notes;
}

export async function unsealJournal(notes: Note[], trash: Note[], settings: Settings) {
  const journal = await readJournal();
  await writeJournal(notes, trash, settings, journal.removed, true);
  await writeVault(null);
  forgetSession();
  vaultOn = false;
  passkeyOn = false;
}

async function exportSession() {
  if (!session) throw new Error("Unlock the journal first.");
  return new Uint8Array(await crypto.subtle.exportKey("raw", session));
}

export async function changePassphrase(passphrase: string) {
  requirePassphrase(passphrase);
  const record = await currentVault();
  if (!record.vault) throw new Error("This journal is not sealed.");
  const raw = await exportSession();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passKey = await derivePassphrase(passphrase, salt, KDF_ITERATIONS);
  const next: VaultRecord = {
    ...record.vault,
    kdf: { salt: bytesToB64(salt), iterations: KDF_ITERATIONS },
    passphrase: await wrapRaw(raw, passKey),
  };
  raw.fill(0);
  await writeVault(next);
}

export async function replaceRecovery() {
  const record = await currentVault();
  if (!record.vault) throw new Error("This journal is not sealed.");
  const raw = await exportSession();
  const recoveryRaw = crypto.getRandomValues(new Uint8Array(20));
  const next: VaultRecord = { ...record.vault, recovery: await wrapRaw(raw, await recoveryAes(recoveryRaw)) };
  raw.fill(0);
  await writeVault(next);
  return encodeRecovery(recoveryRaw);
}

type PrfResults = { prf?: { results?: { first?: ArrayBuffer } } };

function prfExtension(salt: Uint8Array, credentialId?: Uint8Array) {
  const first = new Uint8Array(salt);
  const prf: {
    eval: { first: Uint8Array };
    evalByCredential?: Record<string, { first: Uint8Array }>;
  } = { eval: { first } };
  if (credentialId) prf.evalByCredential = { [bytesToB64Url(credentialId)]: { first: new Uint8Array(salt) } };
  return { prf } as AuthenticationExtensionsClientInputs;
}

function prfBytes(cred: PublicKeyCredential) {
  const first = (cred.getClientExtensionResults() as PrfResults).prf?.results?.first;
  if (!first) throw new Error("This device cannot unlock a sealed journal.");
  return new Uint8Array(first);
}

export async function deviceUnlockAvailable() {
  if (typeof PublicKeyCredential === "undefined" || !PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function enrollPasskey() {
  if (!session) throw new Error("Unlock the journal first.");
  if (!(await deviceUnlockAvailable())) throw new Error("This device has no fingerprint, face, or PIN unlock.");
  const record = await currentVault();
  if (!record.vault) throw new Error("Seal the journal with a passphrase first.");
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "TLNotes" },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: "journal",
        displayName: "TLNotes",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      timeout: 60_000,
      extensions: prfExtension(salt),
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Device unlock was cancelled.");
  const secret = prfBytes(cred);
  const raw = await exportSession();
  const wrapped = await wrapRaw(raw, await importAes(secret));
  raw.fill(0);
  const id = bytesToB64(new Uint8Array(cred.rawId));
  const next: VaultRecord = { ...record.vault, passkey: { id, salt: bytesToB64(salt), wrapped } };
  await writeVault(next);
  passkeyOn = true;
}

export async function removePasskey() {
  const record = await currentVault();
  if (!record.vault) return;
  await writeVault({ ...record.vault, passkey: null });
  passkeyOn = false;
}

export async function unlockWithPasskey() {
  const record = await currentVault();
  const passkey = record.vault?.passkey;
  if (!passkey) throw new Error("Device unlock is not set.");
  const id = b64ToBytes(passkey.id);
  let cred: PublicKeyCredential | null;
  try {
    cred = (await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: "public-key", id }],
        userVerification: "required",
        timeout: 60_000,
        extensions: prfExtension(b64ToBytes(passkey.salt), id),
      },
    })) as PublicKeyCredential | null;
  } catch {
    throw new Error("Device unlock was cancelled.");
  }
  if (!cred) throw new Error("Device unlock was cancelled.");
  try {
    const raw = await unwrapRaw(passkey.wrapped, await importAes(prfBytes(cred)));
    session = await dataKeyFrom(raw);
    raw.fill(0);
    void holdSession();
  } catch {
    forgetSession();
    throw new Error("This device could not open the journal.");
  }
  vaultOn = true;
  passkeyOn = true;
  return Promise.all(record.sealed.map((item) => openSealed(item, session!)));
}
