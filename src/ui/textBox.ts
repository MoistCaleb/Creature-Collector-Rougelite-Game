import { shieldInput } from './domShield';
/**
 * A plain HTML text box over the game, for things a canvas can't do well: showing a long code
 * the player can select and copy, or a box they can paste into. Phaser input is blocked
 * underneath while it's open.
 */

export interface TextBoxAction {
  label: string;
  primary?: boolean;
  /** Return false to keep the box open (e.g. to show an error). */
  onClick: (box: TextBoxHandle) => void | boolean | Promise<void | boolean>;
}

export interface TextBoxHandle {
  value(): string;
  setStatus(msg: string, kind?: 'ok' | 'error' | 'info'): void;
  setLabel(index: number, label: string): void;
  close(): void;
}

export function openTextBox(opts: {
  title: string;
  body: string;
  value?: string;
  readOnly?: boolean;
  placeholder?: string;
  /** Writing, not a code: a normal font, spellcheck and autocorrect, wrapped by word. */
  prose?: boolean;
  /** Most characters allowed. */
  maxLength?: number;
  actions: TextBoxAction[];
}): TextBoxHandle {
  const font = 'system-ui,-apple-system,sans-serif';
  const shade = document.createElement('div');
  shade.style.cssText =
    'position:fixed;inset:0;z-index:60;background:rgba(10,8,16,.82);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';
  shieldInput(shade);
  const card = document.createElement('div');
  card.style.cssText = `width:100%;max-width:440px;max-height:100%;overflow:auto;box-sizing:border-box;background:#241d33;border:2px solid #4a3f66;border-radius:12px;padding:16px;color:#f4efff;font:14px ${font}`;
  const h = document.createElement('div');
  h.textContent = opts.title;
  h.style.cssText = `font:700 20px ${font};color:#ffc94d;text-align:center;margin-bottom:8px`;
  const p = document.createElement('div');
  p.textContent = opts.body;
  p.style.cssText = 'color:#c9c0e0;line-height:1.4;margin-bottom:10px;white-space:pre-line';
  const ta = document.createElement('textarea');
  ta.value = opts.value ?? '';
  ta.readOnly = !!opts.readOnly;
  ta.placeholder = opts.placeholder ?? '';
  ta.spellcheck = !!opts.prose;
  ta.autocapitalize = opts.prose ? 'sentences' : 'off';
  ta.setAttribute('autocorrect', opts.prose ? 'on' : 'off');
  if (opts.maxLength) ta.maxLength = opts.maxLength;
  ta.style.cssText =
    `width:100%;height:${opts.prose ? 160 : 120}px;box-sizing:border-box;resize:none;border-radius:8px;border:1px solid #4a3f66;background:#15111f;color:#e8e0ff;` +
    (opts.prose ? `font:16px ${font};padding:10px;line-height:1.4` : 'font:12px ui-monospace,Menlo,monospace;padding:8px;word-break:break-all');
  const status = document.createElement('div');
  status.style.cssText = 'min-height:18px;margin:8px 0 4px;text-align:center;font-weight:600';
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center';

  const handle: TextBoxHandle = {
    value: () => ta.value,
    setStatus(msg, kind = 'info') {
      status.textContent = msg;
      status.style.color = kind === 'error' ? '#ff8a7a' : kind === 'ok' ? '#8fe08a' : '#c9c0e0';
    },
    setLabel(i, label) {
      const b = buttons[i];
      if (b) b.textContent = label;
    },
    close() {
      shade.remove();
    },
  };
  const buttons = opts.actions.map((a) => {
    const b = document.createElement('button');
    b.textContent = a.label;
    b.style.cssText =
      `flex:1 1 120px;min-height:44px;border-radius:8px;cursor:pointer;font:700 15px ${font};` +
      (a.primary ? 'background:#ffc94d;color:#1a1424;border:0' : 'background:#352b4d;color:#f4efff;border:1px solid #4a3f66');
    b.onclick = async () => {
      const keep = await a.onClick(handle);
      if (keep !== false) handle.close();
    };
    row.appendChild(b);
    return b;
  });
  // Taps on the shade (not the card) don't fall through to the game.
  for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup']) shade.addEventListener(ev, (e) => e.stopPropagation());
  card.append(h, p, ta, status, row);
  shade.appendChild(card);
  document.body.appendChild(shade);
  if (opts.readOnly) {
    ta.addEventListener('focus', () => ta.select());
  } else setTimeout(() => ta.focus(), 50);
  return handle;
}

/** Copy text to the clipboard. Returns false where the browser won't allow it. */
export async function copyText(s: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(s);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = s;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
