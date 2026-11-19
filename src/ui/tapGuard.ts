import Phaser from 'phaser';

/**
 * A tap on anything counts only when the press started on that same object. Without this, a press
 * on one map hex that is released over another (the map glided under the pointer, as a Mac
 * trackpad's leftover scroll does, or the finger slid) taps the other one. Applies to every
 * interactive object's own 'pointerup' event; scene-wide input listeners are untouched.
 */
let installed = false;
export function installTapGuard() {
  if (installed) return;
  installed = true;
  const proto = Phaser.GameObjects.GameObject.prototype as unknown as {
    emit: (event: string | symbol, ...args: unknown[]) => boolean;
  };
  const emit = proto.emit;
  proto.emit = function (this: { __downAt?: number }, event: string | symbol, ...args: unknown[]) {
    const p = args[0] as { downTime?: number } | undefined;
    if (event === 'pointerdown' && p) this.__downAt = p.downTime;
    else if (event === 'pointerup' && p && typeof p.downTime === 'number' && this.__downAt !== p.downTime) return false;
    return emit.call(this, event, ...args);
  };
}
