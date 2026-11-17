import type Phaser from 'phaser';
import { FONT, FW, OX, OY } from './widgets';

/**
 * A real text field laid over the canvas (so the phone keyboard works) at board coordinates
 * x, y, w, h. It follows the canvas when the screen resizes or turns, and goes away with the scene.
 * Draw the box's frame on the canvas yourself; this is just the transparent input on top.
 */
export function searchBox(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { value?: string; placeholder?: string; onInput: (v: string) => void },
): HTMLInputElement {
  const el = document.createElement('input');
  el.type = 'search';
  el.placeholder = opts.placeholder ?? 'Search by name…';
  el.value = opts.value ?? '';
  el.autocomplete = 'off';
  el.spellcheck = false;
  Object.assign(el.style, {
    position: 'fixed',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: '#f0eaff',
    fontFamily: FONT,
    padding: '0 10px',
    zIndex: '10',
    caretColor: '#ffc94d',
  } as CSSStyleDeclaration);
  const place = () => {
    // The canvas shows the whole frame (FW wide, margins included); the board starts at OX, OY.
    const r = scene.game.canvas.getBoundingClientRect();
    const k = r.width / FW;
    Object.assign(el.style, {
      left: `${r.left + (OX + x) * k}px`,
      top: `${r.top + (OY + y) * k}px`,
      width: `${w * k}px`,
      height: `${h * k}px`,
      fontSize: `${Math.max(16, Math.round(15 * k))}px`,
    });
  };
  place();
  el.addEventListener('input', () => opts.onInput(el.value));
  window.addEventListener('resize', place);
  window.addEventListener('game-layout', place);
  scene.events.once('shutdown', () => {
    window.removeEventListener('resize', place);
    window.removeEventListener('game-layout', place);
    el.remove();
  });
  document.body.appendChild(el);
  return el;
}
