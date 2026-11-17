import Phaser from 'phaser';
import { prefs } from './prefs';

/** True when the player asked for less motion (Settings › Reduce motion). */
export const calm = (): boolean => prefs.reduceMotion;

/**
 * Reduce motion, everywhere at once: camera shakes and full-screen flashes do nothing while the
 * setting is on. (Individual effects that flash or punch-zoom by themselves check `calm()`.)
 */
export function installMotionGuard() {
  const Cam = Phaser.Cameras.Scene2D.Camera.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const name of ['shake', 'flash'] as const) {
    const original = Cam[name];
    Cam[name] = function (this: unknown, ...args: unknown[]) {
      if (calm()) return this;
      return original.apply(this, args);
    };
  }
}
