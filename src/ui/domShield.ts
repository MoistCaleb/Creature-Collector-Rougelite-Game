/**
 * Phaser also listens for presses on the whole window, so a tap on an HTML popup over the game
 * would land on whatever game button sits under it too. Presses inside `el` stay inside it.
 */
const EVENTS = ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'touchcancel'];

export function shieldInput(el: HTMLElement) {
  for (const e of EVENTS) el.addEventListener(e, (ev) => ev.stopPropagation());
}
