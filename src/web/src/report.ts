/** Redacted problem report (M1 AC 42): version, UA, settings, last log lines. No coordinates or addresses. */
import { logLines } from './log';
import type { Settings } from './state/store';
import { APP_VERSION } from './version';

export function buildReport(settings: Settings, ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): string {
  return [
    `怎么去? ${APP_VERSION}`,
    `ua: ${ua}`,
    `lang: ${settings.lang} size: ${settings.textSize} theme: ${settings.theme} muted: ${settings.muted}`,
    '---',
    ...logLines(),
  ].join('\n');
}
