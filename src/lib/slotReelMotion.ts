// 21 symbols, 80 rpm = one revolution / 750 ms (28 symbols per second).
export const REEL_REVOLUTION_MS = 750;
export const REEL_SYMBOLS_PER_MS = 21 / REEL_REVOLUTION_MS;
export function advanceReel(position:number,elapsedMs:number,frozen=false):number {
  return frozen?position:position-Math.max(0,elapsedMs)*REEL_SYMBOLS_PER_MS;
}
export function reelStopDuration(distance:number):number {
  return Math.max(16,Math.min(180,Math.max(0,distance)/REEL_SYMBOLS_PER_MS));
}
