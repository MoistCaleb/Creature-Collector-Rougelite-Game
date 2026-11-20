/**
 * Save storage. Reads and writes are synchronous against an in-memory copy, mirrored to
 * localStorage and, when the game runs as a claude.ai artifact, to the viewer's private
 * cloud save (the artifact `db` capability). Browser storage alone is not reliable there:
 * it can be wiped or blocked between visits, so the cloud copy is the one that sticks.
 */

type DocRef = {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  set(data: Record<string, unknown>): Promise<void>;
};
type Db = { doc(path: string): DocRef };
type User = { id(): Promise<string | null> };
type ClaudeHost = { use(name: string): Promise<unknown> };

/** Keys that are synced to the cloud save, with their document ids. */
const CLOUD_DOCS: Record<string, string> = { 'ccr-meta-v1': 'meta', 'ccr-run-v1': 'run' };

const cache = new Map<string, string | null>();
let cloudBase: string | null = null;
let db: Db | null = null;
const writing = new Map<string, Promise<void>>();
const queued = new Map<string, string | null>();

function local(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function getItem(key: string): string | null {
  if (cache.has(key)) return cache.get(key)!;
  try {
    return local()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

// ---- other listeners (the account sync): told about every change to the save, unless applying one
let changeHook: ((key: string) => void) | null = null;
let quiet = false;
const flushHooks: (() => Promise<void>)[] = [];

/** Be told when the save changes on this device. */
export function onLocalChange(fn: (key: string) => void) {
  changeHook = fn;
}
/** Write without telling the change listener (e.g. a save just downloaded from your account). */
export function applyQuietly(fn: () => void) {
  quiet = true;
  try {
    fn();
  } finally {
    quiet = false;
  }
}
/** Something else to wait for in flushCloud (e.g. the account upload). */
export function onFlush(fn: () => Promise<void>) {
  flushHooks.push(fn);
}
function changed(key: string) {
  if (!quiet && key in CLOUD_DOCS) changeHook?.(key);
}

export function setItem(key: string, value: string) {
  cache.set(key, value);
  changed(key);
  try {
    local()?.setItem(key, value);
  } catch {
    /* blocked or full: the cloud copy still saves */
  }
  pushCloud(key, value);
}

export function removeItem(key: string) {
  cache.set(key, null);
  changed(key);
  try {
    local()?.removeItem(key);
  } catch {
    /* ignore */
  }
  pushCloud(key, null);
}

/** One write in flight per document; later changes coalesce into the next write. */
function pushCloud(key: string, value: string | null) {
  const docId = CLOUD_DOCS[key];
  if (!db || !cloudBase || !docId) return;
  queued.set(key, value);
  if (writing.has(key)) return;
  const loop = async () => {
    while (queued.has(key)) {
      const v = queued.get(key)!;
      queued.delete(key);
      const ref = db!.doc(`${cloudBase}/${docId}`);
      try {
        // A cleared save is stored as json: null so other devices don't re-upload a stale copy.
        await ref.set({ json: v, savedAt: Date.now() });
      } catch (e) {
        console.warn('Cloud save failed', e);
      }
    }
    writing.delete(key);
  };
  writing.set(key, loop());
}

/** Wait (up to a few seconds) for pending cloud writes, e.g. before reloading the page. */
export async function flushCloud(): Promise<void> {
  const until = Date.now() + 6000;
  while (writing.size && Date.now() < until) await timeout(Promise.all([...writing.values()]), 6000);
  await timeout(Promise.all(flushHooks.map((f) => f().catch(() => {}))), 8000);
}

function timeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

/** Connect the cloud save (if available) and load it. Resolves within a few seconds either way. */
export async function initStorage(): Promise<void> {
  const host = (globalThis as unknown as { claude?: ClaudeHost }).claude;
  if (!host?.use) return;
  try {
    const [dbNs, userNs] = await Promise.all([
      timeout(host.use('db') as Promise<Db | null>, 8000),
      timeout(host.use('user') as Promise<User | null>, 8000),
    ]);
    if (!dbNs || !userNs) return;
    const uid = await timeout(userNs.id(), 5000);
    if (!uid) return;
    db = dbNs;
    cloudBase = `data/users/${uid}`;
    for (const [key, docId] of Object.entries(CLOUD_DOCS)) {
      const snap = await timeout(db.doc(`${cloudBase}/${docId}`).get(), 8000);
      if (!snap) continue;
      const json = snap.exists ? (snap.data()?.json as string | undefined) : undefined;
      if (snap.exists) {
        cache.set(key, typeof json === 'string' ? json : null);
        try {
          if (typeof json === 'string') local()?.setItem(key, json);
          else local()?.removeItem(key);
        } catch {
          /* ignore */
        }
      } else {
        // Nothing in the cloud yet: upload what this browser already has.
        const existing = getItem(key);
        if (existing) pushCloud(key, existing);
      }
    }
  } catch (e) {
    console.warn('Cloud save unavailable', e);
    db = null;
    cloudBase = null;
  }
}
