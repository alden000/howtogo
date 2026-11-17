/** Key-value storage with every access wrapped in try/catch (private mode, quota, blocked storage). */
export interface KV {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

const PREFIX = 'howtogo.';

export function safeStorage(get: () => Storage | undefined): KV {
  return {
    get(k) {
      try {
        return get()?.getItem(PREFIX + k) ?? null;
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        get()?.setItem(PREFIX + k, v);
      } catch {
        /* quota / blocked: run without persistence */
      }
    },
    remove(k) {
      try {
        get()?.removeItem(PREFIX + k);
      } catch {
        /* ignore */
      }
    },
  };
}

export const local = safeStorage(() => globalThis.localStorage);
export const session = safeStorage(() => globalThis.sessionStorage);

export function memoryKV(init: Record<string, string> = {}): KV & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    get: (k) => data[k] ?? null,
    set: (k, v) => void (data[k] = v),
    remove: (k) => void delete data[k],
  };
}

export function readJSON<T>(kv: KV, key: string, fallback: T, validate?: (v: unknown) => v is T): T {
  const s = kv.get(key);
  if (s == null) return fallback;
  try {
    const v = JSON.parse(s) as unknown;
    if (validate && !validate(v)) return fallback;
    return v as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(kv: KV, key: string, v: unknown): void {
  if (v === null || v === undefined) kv.remove(key);
  else kv.set(key, JSON.stringify(v));
}
