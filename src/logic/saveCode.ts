import * as storage from '../storage';
import { hashString } from './rng';
import { fromNewerVersion, savedBy, updateMessage } from './saveVersion';

/**
 * Save transfer: your whole save (progress, plus the run in progress) as one text code you can
 * copy to another device. Codes start with "HEXB", are compressed when the device can, and
 * carry a checksum so a code that got cut off while pasting is caught instead of loaded.
 */

const META_KEY = 'ccr-meta-v1';
const RUN_KEY = 'ccr-run-v1';
const MAX_CODE = 3_000_000;

export interface SaveBundle {
  /** When the code was made (ms since 1970). */
  at: number;
  /** The save itself, as stored (JSON strings). */
  meta: string;
  run: string | null;
}

/** A quick look at what a code holds, for the "Replace your progress?" question. */
export interface SaveSummary {
  at: number;
  runs: number;
  wins: number;
  caught: number;
  gilded: number;
  runInProgress: boolean;
}

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

const canCompress = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

/** Turn a save into a code. */
export async function encodeSave(bundle: SaveBundle): Promise<string> {
  const json = JSON.stringify({ v: 1, ...bundle });
  const raw = new TextEncoder().encode(json);
  const sum = hashString(json).toString(36);
  if (canCompress()) {
    try {
      return `HEXB1.${toB64(await pipe(raw, new CompressionStream('deflate-raw')))}.${sum}`;
    } catch {
      /* fall through to an uncompressed code */
    }
  }
  return `HEXB0.${toB64(raw)}.${sum}`;
}

/** Read a code back. Throws an Error with a message fit to show the player. */
export async function decodeSave(code: string): Promise<SaveBundle> {
  const clean = code.replace(/\s+/g, '');
  if (!clean) throw new Error('Paste a save code first.');
  if (clean.length > MAX_CODE) throw new Error('That code is too long to be a Hexbound save.');
  const m = /^HEXB([01])\.([A-Za-z0-9_-]+)\.([0-9a-z]+)$/.exec(clean);
  if (!m) throw new Error('That isn’t a Hexbound save code. Codes start with HEXB.');
  let json: string;
  try {
    let bytes = fromB64(m[2]);
    if (m[1] === '1') {
      if (!canCompress()) throw new Error('This device can’t open compressed codes. Update your browser and try again.');
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    }
    json = new TextDecoder().decode(bytes);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('This device')) throw e;
    throw new Error('That code is damaged. Make sure you copied all of it.');
  }
  if (hashString(json).toString(36) !== m[3]) throw new Error('That code is incomplete or changed. Make sure you copied all of it.');
  let data: { v?: number; at?: number; meta?: unknown; run?: unknown };
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('That code is damaged. Make sure you copied all of it.');
  }
  if (data.v !== 1 || typeof data.meta !== 'string') throw new Error('That code is from a newer version of Hexbound. Update the game and try again.');
  if (fromNewerVersion(data.meta)) throw new Error(updateMessage(savedBy(data.meta)));
  try {
    const meta = JSON.parse(data.meta);
    if (!meta || typeof meta !== 'object' || !Array.isArray(meta.unlockedStarters)) throw new Error();
    if (typeof data.run === 'string') JSON.parse(data.run);
  } catch {
    throw new Error('That code doesn’t hold a Hexbound save.');
  }
  return { at: Number(data.at) || 0, meta: data.meta, run: typeof data.run === 'string' ? data.run : null };
}

export function summarize(bundle: SaveBundle): SaveSummary {
  const meta = JSON.parse(bundle.meta) as { runs?: number; wins?: number; dex?: { caught?: unknown[] }; shinyOwned?: unknown[] };
  return {
    at: bundle.at,
    runs: Number(meta.runs) || 0,
    wins: Number(meta.wins) || 0,
    caught: meta.dex?.caught?.length ?? 0,
    gilded: meta.shinyOwned?.length ?? 0,
    runInProgress: !!bundle.run,
  };
}

/** This device's save as a code. */
export async function exportSave(): Promise<string> {
  const meta = storage.getItem(META_KEY);
  return encodeSave({ at: Date.now(), meta: meta ?? '{"unlockedStarters":[]}', run: storage.getItem(RUN_KEY) });
}

/** Replace this device's save with the bundle (and its cloud copy, when there is one). Reload after. */
export async function importSave(bundle: SaveBundle): Promise<void> {
  storage.setItem(META_KEY, bundle.meta);
  if (bundle.run) storage.setItem(RUN_KEY, bundle.run);
  else storage.removeItem(RUN_KEY);
  await storage.flushCloud();
}
