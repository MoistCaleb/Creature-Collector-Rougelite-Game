/**
 * Installable app support. Registers the offline service worker and captures the browser's
 * install prompt so the title screen can offer an "Install app" button.
 *
 * Inside the claude.ai viewer (where `window.claude` exists) none of this applies: the page is
 * framed, so installing it would install claude.ai, not the game.
 */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export const inClaudeViewer = () => typeof window !== 'undefined' && 'claude' in window;

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

/** What the title screen can offer: a real install prompt, iOS instructions, or nothing. */
export function installOption(): 'prompt' | 'ios' | null {
  if (inClaudeViewer() || isStandalone()) return null;
  if (deferred) return 'prompt';
  if (isIOS()) return 'ios';
  return null;
}

/** Shows the browser's install dialog. Resolves true if the player installed. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  await e.prompt();
  const choice = await e.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
  return choice.outcome === 'accepted';
}

/** Called when the install option changes (e.g. the browser becomes ready to install). */
export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setupPwa() {
  if (typeof window === 'undefined' || inClaudeViewer()) return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((fn) => fn());
  });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // A new version installs quietly in the background; the game doesn't reload by itself
    // (that could interrupt a battle). The update banner below offers the refresh instead.
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('./sw.js', { updateViaCache: 'none' })
        .then((reg) => {
          void reg.update();
          document.addEventListener('visibilitychange', () => {
            if (!document.hidden) void reg.update();
          });
        })
        .catch(() => {
          /* offline play just won't be available */
        });
    });
  }
  watchForUpdates();
}

// ---------------------------------------------------------------- "New version available"

let bannerShown = false;

/** Is a newer build online than the one running? (version.json is written by every build.) */
export async function newerBuildOnline(): Promise<boolean> {
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return false;
    const { build } = (await res.json()) as { build?: string };
    return typeof build === 'string' && build !== __BUILD__;
  } catch {
    return false; // offline
  }
}

/** Check on launch, whenever the app comes back to the front, and every half hour. */
function watchForUpdates() {
  if (!import.meta.env.PROD || !/^https?:$/.test(location.protocol)) return;
  const check = () => {
    if (bannerShown || document.hidden) return;
    void newerBuildOnline().then((yes) => yes && showUpdateBanner());
  };
  setTimeout(check, 4000);
  document.addEventListener('visibilitychange', check);
  setInterval(check, 30 * 60 * 1000);
}

/** A small bar over the top of the game: tap to load the new version (your run is saved). */
export function showUpdateBanner() {
  if (bannerShown) return;
  bannerShown = true;
  const bar = document.createElement('div');
  bar.style.cssText =
    'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 10px);transform:translateX(-50%);z-index:50;white-space:nowrap;' +
    'display:flex;align-items:center;gap:10px;padding:8px 8px 8px 14px;max-width:calc(100vw - 24px);box-sizing:border-box;' +
    'background:#2a2238;border:2px solid #ffc94d;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.5);' +
    'font:600 14px system-ui,sans-serif;color:#f4efff';
  const msg = document.createElement('span');
  msg.textContent = '✦ New version ready';
  const go = document.createElement('button');
  go.textContent = 'Update';
  go.style.cssText = 'font:700 14px system-ui,sans-serif;color:#1a1424;background:#ffc94d;border:0;border-radius:7px;padding:8px 14px;cursor:pointer';
  go.onclick = () => {
    go.textContent = 'Updating…';
    // Pages always come from the network first, so a reload is enough to load the new build.
    location.reload();
  };
  const x = document.createElement('button');
  x.textContent = '✕';
  x.setAttribute('aria-label', 'Later');
  x.style.cssText = 'font:700 14px system-ui,sans-serif;color:#8e86ad;background:none;border:0;padding:8px;cursor:pointer';
  x.onclick = () => bar.remove();
  bar.append(msg, go, x);
  document.body.appendChild(bar);
}
