export type DisplayClockState = { ready: boolean; offset: number };

let state: DisplayClockState = { ready: false, offset: 0 };

export function setDisplayClockOffset(offset: number): void {
  state = { ready: true, offset };
}

export function getDisplayClockState(): DisplayClockState {
  return state;
}

export function resetDisplayClock(): void {
  state = { ready: false, offset: 0 };
}
