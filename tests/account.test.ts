import { beforeEach, describe, expect, it, vi } from 'vitest';

// A stand-in for Supabase: one player's save row, and a server clock that only moves forward.
const fake = vi.hoisted(() => {
  const state: { row: { meta: string | null; run: string | null; saved_at: string } | null; clock: number; uploads: number } = { row: null, clock: 1_000_000, uploads: 0 };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      signInWithOtp: async () => ({ error: null }),
      verifyOtp: async ({ email }: { email: string }) => ({ data: { user: { id: 'u1', email } }, error: null }),
      signOut: async () => ({ error: null }),
    },
    rpc: async (name: string) =>
      name === 'my_friends'
        ? {
            error: null,
            data: [
              { user_id: 'b', username: 'zed', friend_code: 'HEX-BBBBB', look: null, title: null, last_seen: new Date(Date.now() - 10 * 60_000).toISOString(), activity: 'In a run', status: 'accepted', incoming: false },
              { user_id: 'a', username: 'amy', friend_code: 'HEX-AAAAA', look: { hat: 2 }, title: 'Rookie', last_seen: new Date().toISOString(), activity: 'In a run', status: 'accepted', incoming: false },
              { user_id: 'c', username: 'cam', friend_code: 'HEX-CCCCC', look: null, title: null, last_seen: null, activity: null, status: 'pending', incoming: true },
            ],
          }
        : { error: null, data: null },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.row, error: null }) }) }),
      upsert: (o: { meta: string; run: string | null }) => ({
        select: () => ({
          single: async () => {
            state.clock += 1000;
            state.uploads++;
            state.row = { meta: o.meta, run: o.run, saved_at: new Date(state.clock).toISOString() };
            return { data: { saved_at: state.row.saved_at }, error: null };
          },
        }),
      }),
    }),
  };
  return { state, client };
});
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake.client }));
vi.mock('../src/net/accountConfig', () => ({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-key' }));

const store: Record<string, string> = {};
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => void (store[k] = v),
  removeItem: (k: string) => void delete store[k],
} as Storage;
(globalThis as unknown as { document: unknown }).document = { addEventListener: () => {}, visibilityState: 'visible' };

const account = await import('../src/net/account');
const storage = await import('../src/storage');

const meta = (runs: number, caught: string[] = ['emberkit']) => JSON.stringify({ runs, dex: { caught } });
const serverSave = (runs: number) => {
  fake.state.clock += 1000;
  fake.state.row = { meta: meta(runs), run: null, saved_at: new Date(fake.state.clock).toISOString() };
};
const encode = async (s: { meta: string | null }) => `CODE:${s.meta}`;

describe('Accounts: keeping the device and the account in step', () => {
  account.startAutoSync();
  beforeEach(async () => {
    for (const k of Object.keys(store)) delete store[k];
    fake.state.row = null;
    storage.applyQuietly(() => {
      storage.removeItem('ccr-meta-v1');
      storage.removeItem('ccr-run-v1');
    });
    await account.signOut();
    await account.verifyCode('me@example.com', '123456');
  });

  it('a new, empty account takes the device’s save', async () => {
    storage.applyQuietly(() => storage.setItem('ccr-meta-v1', meta(5)));
    expect((await account.reconcile()).kind).toBe('pushed');
    expect(fake.state.row?.meta).toBe(meta(5));
  });

  it('a fresh device takes the account’s save', async () => {
    serverSave(9);
    expect((await account.reconcile()).kind).toBe('pulled');
    expect(storage.getItem('ccr-meta-v1')).toBe(meta(9));
  });

  it('first time on a device with its own progress: the player chooses, and the other is backed up', async () => {
    serverSave(9);
    storage.applyQuietly(() => storage.setItem('ccr-meta-v1', meta(3)));
    const out = await account.reconcile();
    expect(out.kind).toBe('conflict');
    if (out.kind !== 'conflict') return;
    await account.resolveConflict('device', out.device, out.account, encode);
    expect(fake.state.row?.meta).toBe(meta(3));
    expect(account.savedBackup()?.code).toBe(`CODE:${meta(9)}`);
  });

  it('once linked: changes here upload, newer changes elsewhere come down, both at once ask', async () => {
    storage.applyQuietly(() => storage.setItem('ccr-meta-v1', meta(1)));
    await account.reconcile();
    // Played on this device: it uploads (and the next sync agrees).
    storage.setItem('ccr-meta-v1', meta(2));
    await account.flushAccount();
    expect(fake.state.row?.meta).toBe(meta(2));
    expect((await account.reconcile()).kind).toBe('pushed');
    // Played on another device: this one picks it up.
    serverSave(7);
    expect((await account.reconcile()).kind).toBe('pulled');
    expect(storage.getItem('ccr-meta-v1')).toBe(meta(7));
    // Both played offline: ask.
    serverSave(8);
    storage.setItem('ccr-meta-v1', meta(4));
    expect((await account.reconcile()).kind).toBe('conflict');
  });

  it('never uploads over an account it hasn’t been compared with', async () => {
    serverSave(9);
    const before = fake.state.uploads;
    storage.setItem('ccr-meta-v1', meta(2));
    await account.flushAccount();
    expect(fake.state.uploads).toBe(before);
    expect(fake.state.row?.meta).toBe(meta(9));
  });

  it('is off until the project is set up, and on the claude.ai version', () => {
    expect(account.accountsAvailable()).toBe(true);
    (globalThis as unknown as { claude?: unknown }).claude = {};
    expect(account.accountsAvailable()).toBe(false);
    delete (globalThis as unknown as { claude?: unknown }).claude;
  });

  it('tells progress from an empty save', () => {
    expect(account.hasProgress(null)).toBe(false);
    expect(account.hasProgress(JSON.stringify({ runs: 0, dex: { caught: [] } }))).toBe(false);
    expect(account.hasProgress(meta(1))).toBe(true);
  });
});

describe('Friends', async () => {
  const friends = await import('../src/net/friends');
  it('usernames follow the trainer name rules', async () => {
    const { cleanName, nameProblem } = await import('../src/data/trainerLook');
    expect(friends.usernameProblem('ab')).toBeTruthy();
    expect(friends.usernameProblem('Ash Ketch')).toBeNull();
    expect(friends.usernameProblem('Sam_99')).toBeNull();
    expect(nameProblem('_sam')).toBeTruthy();
    expect(nameProblem('sam!')).toBeTruthy();
    expect(nameProblem('a'.repeat(17))).toBeTruthy();
    expect(cleanName('  Big    Al ')).toBe('Big Al');
  });
  it('friend codes work however they are typed', () => {
    expect(friends.normalizeCode('hex 4k9p2')).toBe('HEX-4K9P2');
    expect(friends.normalizeCode('4K9P2')).toBe('HEX-4K9P2');
    expect(friends.normalizeCode(' HEX-4K9P2 ')).toBe('HEX-4K9P2');
    expect(friends.normalizeCode('Sam')).toBeNull();
    expect(friends.normalizeCode('Sammy99')).toBeNull();
  });
  it('lists friends online first, and says what they are up to', async () => {
    await account.verifyCode('me@example.com', '123456');
    const list = await friends.listFriends();
    const accepted = list.filter((f) => f.status === 'accepted');
    expect(accepted.map((f) => f.username)).toEqual(['amy', 'zed']);
    expect(accepted[0].online).toBe(true);
    expect(accepted[1].online).toBe(false);
    expect(friends.statusLine(accepted[0])).toBe('Online · In a run');
    expect(friends.statusLine(accepted[1])).toBe('Offline');
    expect(friends.statusLine(list.find((f) => f.username === 'cam')!)).toBe('Wants to be friends');
  });
});
