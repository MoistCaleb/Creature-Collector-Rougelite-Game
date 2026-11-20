import type Phaser from 'phaser';
import {
  accountsAvailable,
  clearBackup,
  currentUser,
  deleteAccount,
  flushAccount,
  lastSynced,
  reconcile,
  resolveConflict,
  restoreSession,
  savedBackup,
  sendCode,
  signOut,
  startAutoSync,
  verifyCode,
  type CloudSave,
} from '../net/account';
import { decodeSave, encodeSave, importSave, summarize, type SaveBundle } from '../logic/saveCode';
import { openPicker, showMessage } from './picker';

const FONT = 'system-ui,-apple-system,sans-serif';

// ---------------------------------------------------------------- a small DOM card (inputs need real fields)

interface Field {
  type: 'email' | 'code' | 'textarea' | 'text';
  placeholder: string;
  /** Starting text. */
  value?: string;
}
interface Card {
  value(): string;
  status(msg: string, kind?: 'ok' | 'error' | 'info'): void;
  busy(on: boolean): void;
  close(): void;
}

export function card(o: { title: string; body: string; field?: Field; buttons: { label: string; primary?: boolean; onClick: (c: Card) => void }[] }): Card {
  const shade = document.createElement('div');
  shade.style.cssText = 'position:fixed;inset:0;z-index:70;background:rgba(10,8,16,.86);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';
  const box = document.createElement('div');
  box.style.cssText = `width:100%;max-width:420px;max-height:100%;overflow:auto;box-sizing:border-box;background:#241d33;border:2px solid #4a3f66;border-radius:12px;padding:16px;color:#f4efff;font:15px ${FONT}`;
  const h = document.createElement('div');
  h.textContent = o.title;
  h.style.cssText = `font:700 20px ${FONT};color:#ffc94d;text-align:center;margin-bottom:8px`;
  const p = document.createElement('div');
  p.textContent = o.body;
  p.style.cssText = 'color:#c9c0e0;line-height:1.45;margin-bottom:12px;white-space:pre-line';
  box.append(h, p);
  let input: HTMLInputElement | HTMLTextAreaElement | null = null;
  if (o.field) {
    if (o.field.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 5;
    } else {
      const i = document.createElement('input');
      if (o.field.type === 'email') {
        i.type = 'email';
        i.autocomplete = 'email';
        i.inputMode = 'email';
      } else if (o.field.type === 'text') {
        i.type = 'text';
        i.autocomplete = 'off';
        i.maxLength = 24;
      } else {
        i.type = 'text';
        i.autocomplete = 'one-time-code';
        i.inputMode = 'numeric';
        i.maxLength = 12;
        i.style.letterSpacing = '6px';
        i.style.textAlign = 'center';
      }
      i.autocapitalize = 'off';
      i.spellcheck = false;
      input = i;
    }
    input.placeholder = o.field.placeholder;
    if (o.field.value) input.value = o.field.value;
    input.style.cssText += `;width:100%;box-sizing:border-box;background:#15111f;color:#f4efff;border:1px solid #4a3f66;border-radius:8px;padding:12px;font:16px ${FONT};margin-bottom:10px`;
    box.append(input);
  }
  const msg = document.createElement('div');
  msg.style.cssText = 'min-height:20px;margin-bottom:8px;font-size:13px';
  box.append(msg);
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
  const btns: HTMLButtonElement[] = [];
  const handle: Card = {
    value: () => input?.value ?? '',
    status: (m, kind = 'info') => {
      msg.textContent = m;
      msg.style.color = kind === 'error' ? '#ff8a7a' : kind === 'ok' ? '#8fe08a' : '#c9c0e0';
    },
    busy: (on) => btns.forEach((b) => (b.disabled = on)),
    close: () => shade.remove(),
  };
  for (const b of o.buttons) {
    const el = document.createElement('button');
    el.textContent = b.label;
    el.style.cssText = `flex:1 1 120px;padding:12px;border-radius:8px;border:1px solid #6a5a8a;font:600 15px ${FONT};color:#fff;background:${b.primary ? '#3b6d4a' : '#3a3352'}`;
    el.onclick = () => b.onClick(handle);
    btns.push(el);
    row.append(el);
  }
  box.append(row);
  shade.append(box);
  document.body.append(shade);
  setTimeout(() => input?.focus(), 50);
  return handle;
}

// ---------------------------------------------------------------- which save to keep

const toBundle = (s: CloudSave): SaveBundle => ({ at: s.savedAt, meta: s.meta ?? '{"unlockedStarters":[]}', run: s.run });
const encode = (s: CloudSave) => encodeSave(toBundle(s));

function describe(s: CloudSave): string {
  const x = summarize(toBundle(s));
  const when = new Date(s.savedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return `${x.runs} runs · ${x.wins} wins · ${x.caught} caught${x.runInProgress ? ' · run in progress' : ''}\n${when}`;
}

/** Ask which save to keep. The other stays on this device as a backup (Account › Restore). */
function chooseSave(device: CloudSave, account: CloudSave): Promise<'device' | 'account'> {
  return new Promise((resolve) => {
    card({
      title: 'Which save do you want to keep?',
      body: `This device and your account both have progress.\n\nThis device:\n${describe(device)}\n\nYour account:\n${describe(account)}\n\nThe one you don’t keep is saved on this device as a backup, so you can bring it back from Account if you change your mind.`,
      buttons: [
        { label: 'Keep this device’s', onClick: (c) => (c.close(), resolve('device')) },
        { label: 'Keep my account’s', primary: true, onClick: (c) => (c.close(), resolve('account')) },
      ],
    });
  });
}

/** Match the device and the account, asking when it's not clear. True if the device's save changed. */
async function syncNow(): Promise<boolean> {
  const out = await reconcile();
  if (out.kind === 'pulled') return true;
  if (out.kind !== 'conflict') return false;
  const pick = await chooseSave(out.device, out.account);
  await resolveConflict(pick, out.device, out.account, encode);
  return pick === 'account';
}

/**
 * At start-up, before the game reads the save: pick up the signed-in account, sync with it, and
 * from then on upload changes as they happen. Never blocks for long, and never fails the start.
 */
export async function accountAtBoot(): Promise<void> {
  if (!accountsAvailable()) return;
  try {
    if (await restoreSession()) await Promise.race([syncNow(), new Promise((r) => setTimeout(r, 15000))]);
  } catch (e) {
    console.warn('Account sync skipped', e);
  }
  startAutoSync();
}

// ---------------------------------------------------------------- signing in

/** Email, then the code from it; then sync. `after` runs once signed in (reloads if the save changed). */
function signIn(scene: Phaser.Scene, intro?: string) {
  card({
    title: 'Sign in or create an account',
    body: `${intro ? `${intro}\n\n` : ''}Enter your email and we’ll send you a sign-in code. No password. New here? This makes your account.`,
    field: { type: 'email', placeholder: 'you@example.com' },
    buttons: [
      { label: 'Cancel', onClick: (c) => c.close() },
      {
        label: 'Send code',
        primary: true,
        onClick: async (c) => {
          const email = c.value().trim();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.status('That email address doesn’t look right.', 'error');
          c.busy(true);
          c.status('Sending…');
          try {
            await sendCode(email);
            c.close();
            enterCode(scene, email);
          } catch (e) {
            c.busy(false);
            c.status(e instanceof Error ? e.message : 'Couldn’t send the code.', 'error');
          }
        },
      },
    ],
  });
}

function enterCode(scene: Phaser.Scene, email: string) {
  card({
    title: 'Check your email',
    body: `We sent a sign-in code to ${email}. Type it here. (It can take a minute; check spam too.)`,
    field: { type: 'code', placeholder: 'code' },
    buttons: [
      { label: 'Back', onClick: (c) => (c.close(), signIn(scene)) },
      {
        label: 'Sign in',
        primary: true,
        onClick: async (c) => {
          c.busy(true);
          c.status('Checking…');
          try {
            await verifyCode(email, c.value());
            c.status('Signed in. Syncing your save…', 'ok');
            const changed = await syncNow();
            c.close();
            void import('./friendsUi').then((m) => m.startFriends());
            if (changed) {
              showMessage(scene, 'Signed in', 'Your account’s save is on this device now. The game will reload.', () => window.location.reload());
            } else showMessage(scene, 'Signed in', `Signed in as ${email}. Your progress now saves to your account and follows you to any device.`, () => {});
          } catch (e) {
            c.busy(false);
            c.status(e instanceof Error ? e.message : 'That code didn’t work.', 'error');
          }
        },
      },
    ],
  });
}

/** Sign-up from a save code: load the code onto this device, then sign in (an empty account takes it). */
function startFromCode(scene: Phaser.Scene) {
  card({
    title: 'Start from a save code',
    body: 'Paste a save code from your other device. It goes onto this device, then you sign in or create your account, and it’s saved there.',
    field: { type: 'textarea', placeholder: 'HEXB1.…' },
    buttons: [
      { label: 'Cancel', onClick: (c) => c.close() },
      {
        label: 'Next',
        primary: true,
        onClick: async (c) => {
          try {
            const bundle = await decodeSave(c.value());
            await importSave(bundle);
            c.close();
            signIn(scene, `Save loaded (${summarize(bundle).runs} runs). Now sign in to keep it in your account.`);
          } catch (e) {
            c.status(e instanceof Error ? e.message : 'That code didn’t work.', 'error');
          }
        },
      },
    ],
  });
}

// ---------------------------------------------------------------- the account menu

/** Account and saves: signing in or out, syncing, save codes and the backup. */
export function openAccount(scene: Phaser.Scene, saveCodes: { copy: () => void; load: () => void }) {
  const u = currentUser();
  const backup = savedBackup();
  const restore = backup
    ? [{ label: 'Restore the replaced save', sub: `From ${new Date(backup.at).toLocaleDateString()} (${backup.from === 'account' ? 'your account’s' : 'this device’s'})`, color: 0x4a3a1c }]
    : [];
  const restoreAt = (i: number, first: number) => backup && i === first;
  if (!u) {
    openPicker(scene, {
      title: 'Account & saves',
      subtitle: 'Sign in with your email to keep your progress in your account: it follows you to any device. Or move it by hand with a save code.',
      options: [
        { label: 'Sign in or create an account', color: 0x3b6d4a, sub: 'A code by email, no password' },
        { label: 'Start from a save code', color: 0x2f5a4a, sub: 'New account on a new device? Bring your save' },
        { label: 'Copy my save code', color: 0x2f4a6b, sub: 'To move or back up your progress' },
        { label: 'Load a save code', color: 0x2f4a6b, sub: 'Replaces the progress on this device' },
        ...restore,
      ],
      onPick: (i) => {
        if (i === 0) return signIn(scene);
        if (i === 1) return startFromCode(scene);
        if (i === 2) return saveCodes.copy();
        if (i === 3) return saveCodes.load();
        if (restoreAt(i, 4)) return restoreBackup(scene);
      },
      onCancel: () => {},
    });
    return;
  }
  const synced = lastSynced();
  openPicker(scene, {
    title: 'Account & saves',
    subtitle: `Signed in as ${u.email}.\n${synced ? `Last synced ${new Date(synced).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.` : 'Not synced yet.'} Your progress saves to your account as you play.`,
    options: [
      { label: 'Sync now', color: 0x3b6d4a },
      { label: 'Copy my save code', color: 0x2f4a6b, sub: 'A backup, or to share by hand' },
      { label: 'Load a save code', color: 0x2f4a6b, sub: 'Replaces this device’s and your account’s save' },
      ...restore,
      { label: 'Sign out', color: 0x3a3450, sub: 'Your progress stays on this device' },
      { label: 'Delete my account', color: 0x5a2a2a, sub: 'Removes your account and its save for good' },
    ],
    onPick: async (i) => {
      const off = backup ? 1 : 0;
      if (i === 0) {
        try {
          const changed = await syncNow();
          if (changed) return showMessage(scene, 'Synced', 'Your account had newer progress. The game will reload.', () => window.location.reload());
          await flushAccount(true);
          return showMessage(scene, 'Synced', 'Your progress is saved to your account.', () => {});
        } catch (e) {
          return showMessage(scene, 'Couldn’t sync', e instanceof Error ? e.message : 'Try again in a moment.', () => {});
        }
      }
      if (i === 1) return saveCodes.copy();
      if (i === 2) return saveCodes.load();
      if (restoreAt(i, 3)) return restoreBackup(scene);
      if (i === 3 + off) {
        await signOut();
        void import('./friendsUi').then((m) => m.stopFriends());
        return showMessage(scene, 'Signed out', 'Your progress stays on this device. Sign in again any time.', () => {});
      }
      if (i === 4 + off) return confirmDelete(scene);
    },
    onCancel: () => {},
  });
}

function restoreBackup(scene: Phaser.Scene) {
  const b = savedBackup();
  if (!b) return;
  openPicker(scene, {
    title: 'Restore the replaced save?',
    subtitle: 'This puts back the save you didn’t keep last time, replacing your progress now (and your account’s, if you’re signed in). Your current save becomes the backup.',
    options: [{ label: 'Restore it', color: 0x8a2c2c }],
    onPick: async () => {
      try {
        const bundle = await decodeSave(b.code);
        const now = await import('../logic/saveCode').then((m) => m.exportSave());
        clearBackup();
        globalThis.localStorage?.setItem('ccr-save-backup', JSON.stringify({ code: now, at: Date.now(), from: 'device' }));
        await importSave(bundle);
        window.location.reload();
      } catch (e) {
        showMessage(scene, 'Couldn’t restore', e instanceof Error ? e.message : 'The backup is damaged.', () => {});
      }
    },
    onCancel: () => {},
  });
}

function confirmDelete(scene: Phaser.Scene) {
  openPicker(scene, {
    title: 'Delete your account?',
    subtitle: 'Your account and the save in it are deleted for good. This device keeps its own copy of your progress.',
    options: [{ label: 'Delete my account', color: 0x8a2c2c }],
    onPick: async () => {
      try {
        await deleteAccount();
        showMessage(scene, 'Account deleted', 'Your account is gone. Your progress is still on this device.', () => {});
      } catch (e) {
        showMessage(scene, 'Couldn’t delete', e instanceof Error ? e.message : 'Try again in a moment.', () => {});
      }
    },
    onCancel: () => {},
  });
}
