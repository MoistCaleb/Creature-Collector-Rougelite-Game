import Phaser from 'phaser';
import { ZOOM } from './widgets';

/**
 * Vertical drag scrolling with flick momentum, for a container that moves up and down.
 * Drag to scroll; let go mid-swipe and it keeps gliding, slowing down, and stops at the ends.
 * `moved` is true once a press has turned into a drag, so taps on list items can ignore it.
 */
export class Scroller {
  /** True while (or right after) the current press is a drag rather than a tap. */
  moved = false;
  private down = false;
  private startPointer = 0;
  private startY = 0;
  private velocity = 0; // layout units per ms
  private lastY = 0;
  private lastT = 0;
  private glide: Phaser.Tweens.Tween | null = null;

  constructor(
    private scene: Phaser.Scene,
    private opts: {
      get: () => number;
      set: (y: number) => void;
      /** Lowest allowed position (content scrolled all the way up). */
      min: () => number;
      /** Highest allowed position (content at the top). */
      max: () => number;
    },
  ) {
    const input = scene.input;
    const down = (p: Phaser.Input.Pointer) => this.onDown(p);
    const move = (p: Phaser.Input.Pointer) => this.onMove(p);
    const up = () => this.onUp();
    const wheel = (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      this.stop();
      this.setY(this.opts.get() - dy);
    };
    input.on('pointerdown', down);
    input.on('pointermove', move);
    input.on('pointerup', up);
    input.on('pointerupoutside', up);
    input.on('wheel', wheel);
    // Scene event listeners outlive a scene restart, so remove this one when the scene shuts down.
    const onUpdate = (_t: number, delta: number) => this.tick(delta);
    scene.events.on('update', onUpdate);
    this.dispose = () => {
      input.off('pointerdown', down);
      input.off('pointermove', move);
      input.off('pointerup', up);
      input.off('pointerupoutside', up);
      input.off('wheel', wheel);
      scene.events.off('update', onUpdate);
      this.stop();
    };
    scene.events.once('shutdown', () => scene.events.off('update', onUpdate));
  }

  /** Stop listening (for a scroller inside a popup that closes before its scene does). */
  dispose: () => void;

  private setY(y: number) {
    this.opts.set(Phaser.Math.Clamp(y, this.opts.min(), this.opts.max()));
  }

  private onDown(p: Phaser.Input.Pointer) {
    this.stop();
    this.down = true;
    this.moved = false;
    this.startPointer = p.y / ZOOM;
    this.startY = this.opts.get();
    this.lastY = this.startPointer;
    this.lastT = performance.now();
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (!this.down || !p.isDown) return;
    const y = p.y / ZOOM;
    if (Math.abs(y - this.startPointer) > 8) this.moved = true;
    if (!this.moved) return;
    this.setY(this.startY + y - this.startPointer);
    const now = performance.now();
    const dt = Math.max(1, now - this.lastT);
    // Smooth the velocity over the last few moves so one jittery sample doesn't dominate.
    this.velocity = this.velocity * 0.4 + ((y - this.lastY) / dt) * 0.6;
    this.lastY = y;
    this.lastT = now;
  }

  private onUp() {
    if (!this.down) return;
    this.down = false;
    // A pause before letting go means no flick.
    if (performance.now() - this.lastT > 120) this.velocity = 0;
  }

  private tick(delta: number) {
    if (this.down || Math.abs(this.velocity) < 0.02) {
      if (!this.down) this.velocity = 0;
      return;
    }
    const before = this.opts.get();
    this.setY(before + this.velocity * delta);
    // Friction; stop dead at either end.
    this.velocity *= Math.pow(0.94, delta / 16);
    if (this.opts.get() === before) this.velocity = 0;
  }

  /** Stop any glide or momentum. */
  stop() {
    this.velocity = 0;
    this.glide?.stop();
    this.glide = null;
  }

  /** Smoothly scroll so the content sits at `y`. */
  glideTo(y: number, onUpdate?: () => void) {
    this.stop();
    const target = Phaser.Math.Clamp(y, this.opts.min(), this.opts.max());
    const t = { y: this.opts.get() };
    this.glide = this.scene.tweens.add({
      targets: t,
      y: target,
      duration: 380,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        this.opts.set(t.y);
        onUpdate?.();
      },
    });
  }
}
