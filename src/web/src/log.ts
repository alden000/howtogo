/**
 * Test/diagnostic log hook. One-line, change-only events such as
 * `screen:/guide`, `cue:get_off_next_stop`, `api:route 200`.
 * Exposed as `window.__howtogoLog` (alias `window.__hooks`, M1 AC 43) for Playwright,
 * and kept (last 200) for the redacted "Report a problem" log. Never log coordinates,
 * addresses or search text here.
 */
import { onZhNameMissing } from '@howtogo/shared';

const MAX = 200;
const lines: string[] = [];
const lastByKey = new Map<string, string>();
/** Keys whose value is change-only per key (e.g. the same screen twice in a row is one line). */
const PER_KEY = new Set(['screen', 'sheet', 'online', 'follow', 'trip', 'exit']);
const ONCE = new Set<string>();

declare global {
  interface Window {
    __howtogoLog?: string[];
    __hooks?: string[];
  }
}

function sink(): string[] {
  if (typeof window === 'undefined') return lines;
  if (!window.__howtogoLog) {
    window.__howtogoLog = lines;
    window.__hooks = lines;
  }
  return window.__howtogoLog;
}

export function log(line: string): void {
  const arr = sink();
  const key = line.split(':', 1)[0] ?? line;
  if (PER_KEY.has(key)) {
    if (lastByKey.get(key) === line) return;
    lastByKey.set(key, line);
  } else if (arr[arr.length - 1] === line) return;
  arr.push(line);
  if (arr.length > MAX) arr.splice(0, arr.length - MAX);
}

/** Log a line at most once per page session (M3 AC 42 `zh_name_missing:<code>`). */
export function logOnce(line: string): void {
  if (ONCE.has(line)) return;
  ONCE.add(line);
  log(line);
}

export function logLines(): readonly string[] {
  return sink();
}

/** Test helper. */
export function resetLog(): void {
  sink().length = 0;
  lastByKey.clear();
  ONCE.clear();
}

// M3 AC 42: a station shown in zh without a zh name (English fallback) is logged once per code.
onZhNameMissing((code) => logOnce(`zh_name_missing:${code}`));
