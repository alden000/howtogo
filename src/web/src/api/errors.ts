/** Typed API errors. UI maps `kind`/`code` to zh/en copy; never shows `message` raw. */
export type ApiErrorKind = 'offline' | 'timeout' | 'network' | 'http' | 'parse' | 'aborted';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  /** Worker machine code, e.g. `upstream_unavailable`, `rate_limited`, `share_ended`. */
  readonly code: string;
  /** From `Retry-After` on 429. */
  readonly retryAfterS?: number;

  constructor(kind: ApiErrorKind, opts: { status?: number; code?: string; message?: string; retryAfterS?: number } = {}) {
    super(opts.message ?? opts.code ?? kind);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = opts.status ?? 0;
    this.code = opts.code ?? kind;
    if (opts.retryAfterS !== undefined) this.retryAfterS = opts.retryAfterS;
  }

  /** Worth retrying later (connectivity, timeout, upstream 5xx, rate limit). */
  get retryable(): boolean {
    return this.kind === 'offline' || this.kind === 'timeout' || this.kind === 'network' || this.status === 429 || this.status >= 500;
  }

  /** The share no longer exists (viewer → "trip ended", sharer → stop sharing). */
  get shareGone(): boolean {
    return this.status === 404 || this.status === 410;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

/** QA-45 (M4 AC 44/47): how a create failed, for the copy — rate limit, no network, or anything else. */
export type FailKind = 'rate' | 'offline' | 'other';
export function failKind(e: unknown): FailKind {
  if (e instanceof ApiError && (e.status === 429 || e.code === 'rate_limited')) return 'rate';
  if (e instanceof ApiError && (e.kind === 'offline' || e.kind === 'network')) return 'offline';
  return 'other';
}
