/** A localStorage that behaves, for tests that care about what was saved. */
class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number {
    return this.data.size;
  }
  clear(): void {
    this.data.clear();
  }
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

export function installStorage(): Storage {
  const store = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true });
  return store;
}

/** A localStorage that throws on every call, like a locked-down browser. */
export function installBrokenStorage(): void {
  Object.defineProperty(globalThis, 'localStorage', {
    get() {
      throw new Error('storage is blocked');
    },
    configurable: true,
  });
}
