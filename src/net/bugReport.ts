import { APP_VERSION } from '../data/changelog';
import { BOONS } from '../data/boons';
import { creatureName } from '../logic/creature';
import { state } from '../state';
import { accountClient, accountsAvailable, currentUser } from './account';
import { myProfile } from './friends';

/**
 * Bug reports (Settings › Report a bug): where it happened, what happened, plus what the game
 * knows (version, screen, run, device, recent errors). They go to the bug_reports table (see
 * supabase/bug-reports.sql), which only the private bug-report key can read. A report that can't
 * be sent (offline) waits on the device and goes the next time the game starts or a report is sent.
 */

export const BUG_PLACES = [
  { id: 'map', label: 'Map & hexes', sub: 'Moving, events, shops, rests, the rival' },
  { id: 'battle', label: 'Battles', sub: 'Moves, traits, boons, guardians, catching' },
  { id: 'camp', label: 'Camp & Workshop', sub: 'Bond, visitors, the Ember stall, upgrades' },
  { id: 'online', label: 'Online', sub: 'Duels, Stage Battle, Battle Royale, friends' },
  { id: 'screens', label: 'Menus & screens', sub: 'Hexlidex, Records, teams, Arena, settings' },
  { id: 'other', label: 'Something else', sub: 'Sound, saving, accounts, anything' },
] as const;

const QUEUE_KEY = 'ccr-bug-queue';
const MAX_DESC = 2000;

interface PendingReport {
  place: string;
  description: string;
  context: Record<string, unknown>;
}

/** The last few errors the game hit (kept from boot, so a report can say what broke). */
const recentErrors: string[] = [];
let watching = false;

/** Start noting errors (call once at boot). */
export function watchErrors() {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  const note = (msg: string) => {
    recentErrors.push(`${new Date().toISOString().slice(11, 19)} ${msg}`.slice(0, 300));
    if (recentErrors.length > 6) recentErrors.shift();
  };
  window.addEventListener('error', (e) => note(`${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { message?: string } | undefined;
    note(`promise: ${r?.message ?? String(e.reason)}`);
  });
}

/** What the game knows right now: version, screen, run, device and recent errors. */
export function bugContext(screen: string): Record<string, unknown> {
  const run = state.run;
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const standalone = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;
  return {
    version: APP_VERSION,
    screen,
    at: new Date().toISOString(),
    device: nav?.userAgent.slice(0, 200),
    view: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}${standalone ? ' app' : ''}` : undefined,
    run: run
      ? {
          map: run.mapId,
          floor: run.floor,
          heat: run.heat ?? 0,
          mode: run.race ? 'online race' : run.daily ? 'daily' : run.weekly ? 'weekly' : run.hunt ? 'gilded hunt' : run.quick ? 'quick' : 'normal',
          node: run.map.nodes[run.currentId]?.kind,
          battle: run.activeBattle?.kind ?? null,
          team: run.team.map((c) => `${creatureName(c)} Lv${c.level}${c.trait ? ` (${c.trait})` : ''}`),
          boons: (run.boons?.held ?? []).map((id) => BOONS[id]?.name ?? id),
        }
      : null,
    runs: state.meta.runs,
    errors: [...recentErrors],
  };
}

function readQueue(): PendingReport[] {
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
    return Array.isArray(q) ? q : [];
  } catch {
    return [];
  }
}

function writeQueue(q: PendingReport[]) {
  try {
    if (q.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-10)));
    else localStorage.removeItem(QUEUE_KEY);
  } catch {
    /* storage full or blocked: nothing to do */
  }
}

/** Reports waiting on this device. */
export const pendingBugReports = (): number => readQueue().length;

async function send(r: PendingReport): Promise<void> {
  const u = currentUser();
  const { error } = await accountClient()
    .from('bug_reports')
    .insert({ place: r.place, description: r.description, context: r.context, user_id: u?.id ?? null, username: myProfile()?.username ?? null });
  if (error) throw new Error(error.message);
}

/** Send any reports that are waiting (quietly; they stay queued if it fails). */
export async function flushBugReports(): Promise<void> {
  if (!accountsAvailable()) return;
  const q = readQueue();
  if (!q.length) return;
  const left: PendingReport[] = [];
  for (const r of q) {
    try {
      await send(r);
    } catch {
      left.push(r);
    }
  }
  writeQueue(left);
}

/**
 * Send a report. 'sent': it's in. 'saved': it couldn't go (offline, or this version can't reach the
 * server), so it waits on the device and goes later.
 */
export async function submitBugReport(place: string, description: string, screen: string): Promise<'sent' | 'saved'> {
  const r: PendingReport = { place, description: description.trim().slice(0, MAX_DESC), context: bugContext(screen) };
  if (accountsAvailable()) {
    try {
      await send(r);
      void flushBugReports();
      return 'sent';
    } catch {
      /* fall through: keep it */
    }
  }
  writeQueue([...readQueue(), r]);
  return 'saved';
}
