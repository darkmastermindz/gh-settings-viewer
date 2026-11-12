/** A small concurrency limiter for parallel fetches. */
export class Limiter {
  #max: number;
  #active = 0;
  #queue: (() => void)[] = [];

  constructor(max: number) {
    this.#max = Math.max(1, max);
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.#active >= this.#max) await new Promise<void>((resolve) => this.#queue.push(resolve));
    this.#active++;
    try {
      return await fn();
    } finally {
      this.#active--;
      this.#queue.shift()?.();
    }
  }
}

/** Maps over items with at most `max` running at once. */
export async function mapLimit<T, R>(items: readonly T[], max: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const limiter = new Limiter(max);
  return Promise.all(items.map((item, i) => limiter.run(() => fn(item, i))));
}
