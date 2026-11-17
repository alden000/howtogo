import { afterEach, describe, expect, it, vi } from "vitest";
import { TTL } from "../src/api";
import { cached, resetMemoryCache } from "../src/cache";

afterEach(() => {
  vi.useRealTimers();
  resetMemoryCache();
});

describe("AC 17 cache lifetimes", () => {
  it("search 24 h, route 2 min, revgeocode 1 h", () => {
    expect(TTL).toEqual({ search: 86_400, route: 120, revgeocode: 3_600 });
  });

  it("a route entry is served for 2 min and refetched after", async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 10, 18, 1, 0, 0), toFake: ["Date"] });
    // Cache API is per-test-run; use a unique key so only the memory tier and its expiry matter.
    const key = `ttl-test:${Math.random()}`;
    let n = 0;
    const produce = async () => String(++n);
    expect((await cached(key, TTL.route, produce)).hit).toBe(false);
    vi.setSystemTime(Date.now() + 119_000);
    expect((await cached(key, TTL.route, produce)).hit).toBe(true);
    vi.setSystemTime(Date.now() + 2_000);
    resetMemoryCache();
    const after = await cached(key, TTL.route, produce);
    expect(after.hit).toBe(false);
    expect(after.body).toBe("2");
  });
});
