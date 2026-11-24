/**
 * The world's clock: time of day and holidays, from the device's local date and time.
 * Purely cosmetic, except that Shadow and Spirit Hexlings roam more at night (in unseeded runs).
 */

export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';

export function dayPhase(now: Date = new Date()): DayPhase {
  const h = now.getHours();
  if (h >= 5 && h < 7) return 'dawn';
  if (h >= 7 && h < 18) return 'day';
  if (h >= 18 && h < 20) return 'dusk';
  return 'night';
}

export type HolidayId = 'newyear' | 'valentine' | 'clover' | 'halloween' | 'winter';

export interface Holiday {
  id: HolidayId;
  name: string;
  /** Short line shown on the map. */
  greeting: string;
  /** [month 1-12, first day, last day], inclusive. */
  days: [number, number, number][];
}

/** Each lasts only a day or a few around the date itself. */
export const HOLIDAYS: Holiday[] = [
  { id: 'newyear', name: 'New Year', greeting: 'Happy New Year!', days: [[12, 31, 31], [1, 1, 1]] },
  { id: 'valentine', name: 'Valentine’s Day', greeting: 'Happy Valentine’s Day!', days: [[2, 14, 14]] },
  { id: 'clover', name: 'St Patrick’s Day', greeting: 'Lucky clovers are in the air!', days: [[3, 17, 17]] },
  { id: 'halloween', name: 'Halloween', greeting: 'Happy Halloween!', days: [[10, 30, 31]] },
  { id: 'winter', name: 'Winter holidays', greeting: 'Happy holidays!', days: [[12, 24, 26]] },
];

export function holidayOn(now: Date = new Date()): Holiday | null {
  const m = now.getMonth() + 1;
  const d = now.getDate();
  return HOLIDAYS.find((h) => h.days.some(([mm, a, b]) => mm === m && d >= a && d <= b)) ?? null;
}

/** At night, this share of wild battles draws from Shadow and Spirit Hexlings, whatever the land. */
export const NIGHT_SHARE = 0.3;

/** Day and night, and holidays, follow the clock (a setting; see ui/prefs). */
let clockOn = true;
export function setWorldClock(on: boolean) {
  clockOn = on;
}
/**
 * A battle's sky by the clock: day in the daytime (a foggy stage stays foggy), the warm dusk sky
 * at dawn and dusk, night at night. With the clock off, the stage keeps its own time of day.
 */
export function clockSky<M extends 'day' | 'dusk' | 'night' | 'fog'>(own: M, now: Date | null = new Date()): 'day' | 'dusk' | 'night' | 'fog' {
  if (!clockOn || !now) return own;
  const phase = dayPhase(now);
  if (phase === 'day') return own === 'fog' ? 'fog' : 'day';
  if (phase === 'night') return 'night';
  return 'dusk';
}

/** Is it night out right now (and is the clock on)? */
export const nightOut = (now: Date = new Date()): boolean => clockOn && dayPhase(now) === 'night';
