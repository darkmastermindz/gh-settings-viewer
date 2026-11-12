/** Injected so tests can control time. Milliseconds since the epoch. */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };
