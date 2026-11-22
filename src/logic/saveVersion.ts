import { APP_VERSION } from '../data/changelog';

/**
 * Save versions: every save records the game version that wrote it, so an older copy of the game
 * (an app that hasn't updated yet) never overwrites progress made by a newer one. The account
 * server enforces the same rule (supabase/save-version.sql), which also stops copies of the game
 * from before this existed.
 */

/** "1.52" → 1052, "2.0" → 2000: comparable as numbers (also what the server stores). */
export function versionCode(v: string): number {
  const [maj, min] = v.split('.').map((x) => parseInt(x, 10));
  return (Number.isFinite(maj) ? maj : 0) * 1000 + (Number.isFinite(min) ? min : 0);
}

export const GAME_VERSION_CODE = versionCode(APP_VERSION);

/** The version that wrote a saved meta (JSON text), or null for saves from before versions were recorded. */
export function savedBy(metaJson: string | null | undefined): string | null {
  if (!metaJson) return null;
  try {
    const v = (JSON.parse(metaJson) as { savedBy?: unknown }).savedBy;
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

/** Was this save written by a newer version of the game than this one? */
export function fromNewerVersion(metaJson: string | null | undefined): boolean {
  const v = savedBy(metaJson);
  return !!v && versionCode(v) > GAME_VERSION_CODE;
}

export const updateMessage = (v: string | null) =>
  `This save was made with a newer version of Hexbound${v ? ` (v${v})` : ''}. Close and reopen the game to update, then try again.`;
