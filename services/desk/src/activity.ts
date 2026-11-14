export interface Action {
  at: string;
  who: string;
  action: string;
  ticker?: string;
  tx?: string;
  ok: boolean;
  detail?: string;
}

export class RecentActions {
  private readonly items: Action[] = [];
  constructor(private readonly max = 30) {}

  push(a: Omit<Action, "at">): Action {
    const full = { at: new Date().toISOString(), ...a };
    this.items.push(full);
    if (this.items.length > this.max) this.items.shift();
    return full;
  }

  list(filter?: (a: Action) => boolean, limit = this.max): Action[] {
    const out = filter ? this.items.filter(filter) : [...this.items];
    return out.reverse().slice(0, limit);
  }

  last(filter: (a: Action) => boolean): Action | null {
    for (let i = this.items.length - 1; i >= 0; i--) if (filter(this.items[i] as Action)) return this.items[i] as Action;
    return null;
  }
}

export class KeyedMutex {
  private readonly tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    const tail = next.catch(() => undefined);
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return next;
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
