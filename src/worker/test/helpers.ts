import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { vi } from "vitest";
import worker from "../src/index.embed";

export const BASE = "https://api.test";
export const ORIGIN = "https://app.example.sg";

export async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(BASE + path, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

export type FetchHandler = (url: URL, init: RequestInit | undefined, req: Request) => Response | Promise<Response>;

/** Stubs global fetch for upstream calls; records every call. */
export function stubFetch(handler: FetchHandler) {
  const calls: { url: URL; init?: RequestInit; headers: Headers; body?: string }[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input as RequestInfo, init);
    const url = new URL(req.url);
    const body = init?.body !== undefined ? String(init.body) : undefined;
    calls.push({ url, init, headers: req.headers, body });
    return handler(url, init, req);
  });
  return { calls, spy };
}

export const jsonRes = (body: unknown, status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export function tokenResponse(token: string, expiresInMs = 3 * 24 * 3600_000) {
  return jsonRes({ access_token: token, expiry_timestamp: String(Math.floor((Date.now() + expiresInMs) / 1000)) });
}
