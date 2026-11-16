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
    // When a new version's service worker takes over, reload once so the new game loads.
    // Runs are saved after every step, so this is safe even mid-run.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      location.reload();
    });
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('./sw.js', { updateViaCache: 'none' })
        .then((reg) => {
          // Check for a new version on launch and whenever the app comes back to the foreground.
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
}
