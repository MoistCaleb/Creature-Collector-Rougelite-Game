import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as storage from '../storage';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './accountConfig';
import { fromNewerVersion, GAME_VERSION_CODE, savedBy } from '../logic/saveVersion';

/**
 * Accounts: sign in with your email (a 6-digit code, no password) and your save follows you to
 * every device. The save still lives on the device too, so the game plays the same offline;
 * changes upload a few seconds after they happen, and sync again when you come back.
 *
 * When this device and the account both have progress that the other hasn't seen, the player
 * chooses which to keep (the other is kept on the device as a backup they can restore).
 */

const META_KEY = 'ccr-meta-v1';
const RUN_KEY = 'ccr-run-v1';
/** Which account this device's save is linked to, and when they last matched. */
const SYNC_KEY = 'ccr-account-sync';
/** The save a sync choice replaced: { code, at, from }. */
export const BACKUP_KEY = 'ccr-save-backup';

export interface AccountUser {
  id: string;
  email: string;
}

/** A save as stored: the JSON strings, and when it was saved to the account. */
export interface CloudSave {
  meta: string | null;
  run: string | null;
  savedAt: number;
}

interface SyncState {
  uid: string;
  /** The account's saved_at when this device last matched it. */
  serverAt: number;
  /** Changes made on this device so far, and how many of them the account has. */
  changes: number;
  synced: number;
  /** When this device last matched the account (for "Last synced"). */
  syncedAt: number;
}

/**
 * The account holds a save from a newer version of the game: this device neither pulls it nor
 * uploads over it until the game is updated. Holds the newer version (or '' if unknown).
 */
let newerOnAccount: string | null = null;
export const accountNeedsUpdate = (): string | null => newerOnAccount;
/** The server has the game_version column (supabase/save-version.sql); until then, saves go without it. */
let versionColumn = true;

let client: SupabaseClient | null = null;
let user: AccountUser | null = null;

/** Accounts work here: the project is set up, and this isn't the claude.ai version (which has its own cloud save). */
export function accountsAvailable(): boolean {
  const inClaude = !!(globalThis as unknown as { claude?: unknown }).claude;
  return !!SUPABASE_URL && !!SUPABASE_ANON_KEY && !inClaude && typeof fetch === 'function';
}

function sb(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'ccr-auth' },
  });
  return client;
}

export const currentUser = (): AccountUser | null => user;
/** The signed-in Supabase client, for the friends features. */
export const accountClient = (): SupabaseClient => sb();

function readJson<T>(key: string): T | null {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, v: unknown) {
  try {
    if (v === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, JSON.stringify(v));
  } catch {
    /* storage blocked: sync just happens again next time */
  }
}
const readSync = () => readJson<SyncState>(SYNC_KEY);
export const lastSynced = (): number | null => {
  const s = readSync();
  return s && user && s.uid === user.id ? s.syncedAt : null;
};

// ---------------------------------------------------------------- signing in

/** Pick up a session kept from last time (no network needed to know who you are). */
export async function restoreSession(): Promise<AccountUser | null> {
  if (!accountsAvailable()) return null;
  try {
    const { data } = await sb().auth.getSession();
    const u = data.session?.user;
    user = u ? { id: u.id, email: u.email ?? '' } : null;
  } catch {
    user = null;
  }
  return user;
}

/** Email a 6-digit sign-in code (it makes the account the first time). */
export async function sendCode(email: string): Promise<void> {
  const { error } = await sb().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  if (error) throw new Error(friendly(error.message));
}

/** Check the code from the email: you're signed in. */
export async function verifyCode(email: string, code: string): Promise<AccountUser> {
  const { data, error } = await sb().auth.verifyOtp({ email: email.trim(), token: code.replace(/\s+/g, ''), type: 'email' });
  if (error || !data.user) throw new Error(friendly(error?.message ?? 'That code didn’t work.'));
  user = { id: data.user.id, email: data.user.email ?? email };
  return user;
}

export async function signOut(): Promise<void> {
  await flushAccount();
  try {
    await sb().auth.signOut();
  } catch {
    /* signed out locally either way */
  }
  user = null;
  writeJson(SYNC_KEY, null);
}

/** Delete the account and its save for good (this device keeps its own copy). */
export async function deleteAccount(): Promise<void> {
  const { error } = await sb().rpc('delete_my_account');
  if (error) throw new Error(friendly(error.message));
  try {
    await sb().auth.signOut();
  } catch {
    /* already gone */
  }
  user = null;
  writeJson(SYNC_KEY, null);
}

function friendly(msg: string): string {
  if (/rate limit|too many/i.test(msg)) return 'Too many tries. Wait a minute, then try again.';
  if (/expired|invalid|token/i.test(msg)) return 'That code didn’t work, or it has expired. Ask for a new one.';
  if (/fetch|network|failed to/i.test(msg)) return 'Couldn’t reach the account server. Check your connection.';
  if (/email/i.test(msg)) return 'That email address doesn’t look right.';
  return msg;
}

// ---------------------------------------------------------------- the save in the account

export async function fetchSave(): Promise<CloudSave | null> {
  if (!user) return null;
  const { data, error } = await sb().from('saves').select('meta, run, saved_at').eq('user_id', user.id).maybeSingle();
  if (error) throw new Error(friendly(error.message));
  if (!data) return null;
  return { meta: data.meta ?? null, run: data.run ?? null, savedAt: Date.parse(data.saved_at) || 0 };
}

async function uploadNow(): Promise<void> {
  if (!user) return;
  const meta = storage.getItem(META_KEY);
  if (!meta) return;
  const run = storage.getItem(RUN_KEY);
  const before = readSync();
  const upTo = before?.uid === user.id ? before.changes : 0;
  const row = { user_id: user.id, meta, run, saved_at: new Date().toISOString(), ...(versionColumn ? { game_version: GAME_VERSION_CODE } : {}) };
  let { data, error } = await sb().from('saves').upsert(row).select('saved_at').single();
  if (error && versionColumn && /game_version/.test(error.message)) {
    // The server isn't set up for versions yet: save without one.
    versionColumn = false;
    const { game_version: _v, ...plain } = row as typeof row & { game_version?: number };
    void _v;
    ({ data, error } = await sb().from('saves').upsert(plain).select('saved_at').single());
  }
  if (error && /newer version/i.test(error.message)) {
    // The server refused: the account has progress from a newer version of the game.
    newerOnAccount = '';
    throw new Error(error.message);
  }
  if (error || !data) throw new Error(friendly(error?.message ?? 'Couldn’t save.'));
  const prev = readSync();
  // Changes made while uploading still count as unsynced.
  const changes = prev?.uid === user.id ? prev.changes : upTo;
  writeJson(SYNC_KEY, { uid: user.id, serverAt: Date.parse(data.saved_at) || Date.now(), changes, synced: upTo, syncedAt: Date.now() } satisfies SyncState);
}

// ---- uploads: a few seconds after the last change, one at a time
let timer: ReturnType<typeof setTimeout> | null = null;
let uploading: Promise<void> | null = null;
let pending = false;

function schedule(delay = 3000) {
  if (!user) return;
  pending = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flushAccount(), delay);
}

/**
 * Upload now if anything is waiting (and wait for an upload in flight). Only once this device is
 * linked to the account (see reconcile), unless `force`: so a save never overwrites an account
 * it hasn't been compared with.
 */
export async function flushAccount(force = false): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  if (uploading) await uploading.catch(() => {});
  if (!pending || !user) return;
  if (newerOnAccount !== null) return;
  if (!force && readSync()?.uid !== user.id) return;
  pending = false;
  uploading = uploadNow().catch((e) => {
    pending = true;
    console.warn('Account save failed', e);
  });
  await uploading;
  uploading = null;
}

/** Hook into the device save: every change is noted and uploaded shortly after. */
export function startAutoSync() {
  if (!accountsAvailable()) return;
  storage.onLocalChange(() => {
    const s = readSync();
    if (user && s?.uid === user.id) writeJson(SYNC_KEY, { ...s, changes: s.changes + 1 });
    schedule();
  });
  storage.onFlush(() => flushAccount());
  // Leaving the app (or locking the phone): upload what's waiting.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushAccount();
  });
  globalThis.addEventListener?.('online', () => void flushAccount());
}

// ---------------------------------------------------------------- matching the device and the account

export type SyncOutcome =
  | { kind: 'none' }
  /** The device's save was uploaded (or already matched). */
  | { kind: 'pushed' }
  /** The account's save replaced the device's: reload (or start) the game to use it. */
  | { kind: 'pulled' }
  /** Both have progress the other hasn't seen: the player picks. */
  | { kind: 'conflict'; device: CloudSave; account: CloudSave }
  /** The account's save is from a newer version of the game: update before syncing. */
  | { kind: 'update'; version: string | null };

/** Does this save hold any progress worth keeping? */
export function hasProgress(meta: string | null): boolean {
  if (!meta) return false;
  try {
    const m = JSON.parse(meta) as { runs?: number; dex?: { caught?: unknown[] } };
    return (m.runs ?? 0) > 0 || (m.dex?.caught?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Compare this device's save with the account's and bring them in line where it's clear which wins. */
export async function reconcile(): Promise<SyncOutcome> {
  if (!user) return { kind: 'none' };
  const account = await fetchSave();
  const device: CloudSave = { meta: storage.getItem(META_KEY), run: storage.getItem(RUN_KEY), savedAt: Date.now() };
  const sync = readSync();
  const linked = sync?.uid === user.id ? sync : null;
  // A newer version saved to this account: don't take it (this version may not understand it) and
  // don't overwrite it. Syncing resumes once the game is updated.
  if (fromNewerVersion(account?.meta)) {
    newerOnAccount = savedBy(account?.meta) ?? '';
    return { kind: 'update', version: newerOnAccount || null };
  }
  newerOnAccount = null;
  if (!account?.meta) {
    pending = true;
    await flushAccount(true);
    return { kind: 'pushed' };
  }
  if (!hasProgress(device.meta)) {
    applySave(account);
    return { kind: 'pulled' };
  }
  if (account.meta === device.meta && account.run === device.run) {
    writeJson(SYNC_KEY, { uid: user.id, serverAt: account.savedAt, changes: linked?.changes ?? 0, synced: linked?.changes ?? 0, syncedAt: Date.now() } satisfies SyncState);
    return { kind: 'pushed' };
  }
  if (linked) {
    const accountNewer = account.savedAt > linked.serverAt;
    const deviceNewer = linked.changes > linked.synced;
    if (accountNewer && deviceNewer) return { kind: 'conflict', device, account };
    if (accountNewer) {
      applySave(account);
      return { kind: 'pulled' };
    }
    pending = true;
    await flushAccount(true);
    return { kind: 'pushed' };
  }
  // First time this device meets this account, and they differ.
  return { kind: 'conflict', device, account };
}

/** Put a save on the device (from the account), without counting it as a change made here. */
function applySave(save: CloudSave) {
  storage.applyQuietly(() => {
    if (save.meta) storage.setItem(META_KEY, save.meta);
    if (save.run) storage.setItem(RUN_KEY, save.run);
    else storage.removeItem(RUN_KEY);
  });
  if (!user) return;
  const s = readSync();
  const changes = s?.uid === user.id ? s.changes : 0;
  writeJson(SYNC_KEY, { uid: user.id, serverAt: save.savedAt, changes, synced: changes, syncedAt: Date.now() } satisfies SyncState);
}

/** The player chose: keep `pick`; the other is kept on the device as a backup code. */
export async function resolveConflict(pick: 'device' | 'account', device: CloudSave, account: CloudSave, encode: (s: CloudSave) => Promise<string>) {
  const dropped = pick === 'device' ? account : device;
  try {
    writeJson(BACKUP_KEY, { code: await encode(dropped), at: Date.now(), from: pick === 'device' ? 'account' : 'device' });
  } catch {
    /* no backup possible: carry on */
  }
  if (pick === 'account') return applySave(account);
  pending = true;
  await flushAccount(true);
}

export function savedBackup(): { code: string; at: number; from: 'account' | 'device' } | null {
  return readJson(BACKUP_KEY);
}
export function clearBackup() {
  writeJson(BACKUP_KEY, null);
}
