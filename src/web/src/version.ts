export const APP_VERSION = '1.0.0';
declare const __BUILD_DATE__: string | undefined;
/** M5 L2: build day (YYYY-MM-DD, UTC), injected by vite.config.ts; tests fall back to the data date's format. */
export const BUILD_DATE: string = typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : '2026-11-18';
