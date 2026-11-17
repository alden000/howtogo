/**
 * Shared UI pieces built to STYLE-GUIDE §1.4/§5: icon sprite, wordmark, app bar with Back,
 * sheet shell, toast. Markup and class names mirror creative/prototype/index.html.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { signal } from '@preact/signals';
import { useServices, useT } from '../context';
import { log } from '../log';

export type IconName =
  | 'walk' | 'bus' | 'train' | 'home' | 'clinic' | 'market' | 'family' | 'search' | 'mic' | 'help' | 'close'
  | 'back' | 'chev' | 'sliders' | 'nav' | 'check' | 'loc' | 'clock' | 'share' | 'route';

/** Icon paths copied from the prototype's <symbol>s (24px grid, 2.2px stroke). */
const PATHS: Record<IconName, string> = {
  walk: '<circle cx="13" cy="4.5" r="2"/><path d="M9.5 21l2.5-7.5 3 3V21M7 11.5L10.5 8h3l2.5 3 2.5.5M12.5 8l-1 5.5"/>',
  bus: '<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M8 21v-3M16 21v-3M9 6.5h6"/><circle cx="8" cy="14.5" r=".9"/><circle cx="16" cy="14.5" r=".9"/>',
  train: '<rect x="5" y="3" width="14" height="14" rx="4"/><path d="M5 10h14M8.5 21l2-4M15.5 21l-2-4"/><circle cx="9" cy="13.5" r=".9"/><circle cx="15" cy="13.5" r=".9"/>',
  home: '<path d="M4 11l8-7 8 7v8.5a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
  clinic: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M12 9v7M8.5 12.5h7M9 5V3.5h6V5"/>',
  market: '<path d="M3.5 10h17l-1.6 8.6a2 2 0 0 1-2 1.6H7.1a2 2 0 0 1-2-1.6zM8 10l3-6M16 10l-3-6M9 14v3M15 14v3M12 14v3"/>',
  family: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9.5" r="2.3"/><path d="M3.5 20c0-3.5 2.5-6 5.5-6s5.5 2.5 5.5 6M14.5 14.6c.8-.4 1.6-.6 2.5-.6 2.5 0 4 2 4 5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="M6 6l3.5 3.5M18 6l-3.5 3.5M6 18l3.5-3.5M18 18l-3.5-3.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  sliders: '<path d="M4 7h9M18 7h2M4 17h3M12 17h8"/><circle cx="15.5" cy="7" r="2.3"/><circle cx="9.5" cy="17" r="2.3"/>',
  nav: '<path d="M12 3l7 17-7-4-7 4z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  loc: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  share: '<circle cx="12" cy="12" r="2.3"/><path d="M8 8a5.7 5.7 0 0 0 0 8M16 8a5.7 5.7 0 0 1 0 8M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>',
  route: '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8.2 18h6.3a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7h6.3"/>',
};

/** One hidden sprite per page; icons reference it with <use>. */
export function IconSprite() {
  const html = (Object.keys(PATHS) as IconName[]).map((n) => `<symbol id="i-${n}" viewBox="0 0 24 24">${PATHS[n]}</symbol>`).join('');
  return <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Icon({ name, cls = '' }: { name: IconName; cls?: string }) {
  return (
    <svg class={`i ${cls}`} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

/** Logo B "去 seal" (owner's pick, D-8) from creative/logo/b-qu-seal.svg, next to the wordmark. Creative is refining the master mark. */
export function Wordmark({ name }: { name: string }) {
  return (
    <h1 class="wordmark">
      <svg viewBox="0 0 512 512" aria-hidden="true">
        <rect width="512" height="512" rx="116" fill="#FBF5EC" />
        <rect x="36" y="36" width="440" height="440" rx="88" fill="none" stroke="#9A3412" stroke-width="20" />
        <g fill="none" stroke="#9A3412" stroke-width="42" stroke-linecap="round" stroke-linejoin="round">
          <path d="M186 160H326" />
          <path d="M256 104V236" />
          <path d="M136 236H376" />
          <path d="M246 276C226 316 198 350 166 380H300" />
        </g>
        <circle cx="352" cy="380" r="30" fill="#E0A100" />
      </svg>
      <span>{name}</span>
    </h1>
  );
}

/** App bar with the labelled in-app Back button (§6: Back follows the in-app stack). */
export function Bar({ children }: { children?: ComponentChildren }) {
  const { router } = useServices();
  const t = useT();
  return (
    <header class="bar">
      <button type="button" class="backbtn" data-testid="back" aria-label={t('back')} onClick={() => router.back()}>
        <Icon name="back" />
        <span>{t('back')}</span>
      </button>
      <span class="grow" />
      {children}
    </header>
  );
}

/** Help button for bars (only while the help route exists; its content is M4). */
export function HelpButton() {
  const { router } = useServices();
  const t = useT();
  return (
    <button type="button" class="iconbtn" data-testid="bar-help" onClick={() => router.navigate('/help')}>
      <Icon name="help" />
      {t('help')}
    </button>
  );
}

/** Bottom sheet (§5.8 shell): scrim + rising sheet; a history entry, so Back or the scrim closes it. */
export function Sheet(props: { id: string; title: string; close?: boolean; children: ComponentChildren }) {
  const { router } = useServices();
  const t = useT();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && router.closeSheet();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  const titleId = `${props.id}-title`;
  return (
    <div class="sheetwrap">
      <div class="scrim" aria-hidden="true" onClick={() => router.closeSheet()} />
      <section ref={ref} class="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-testid={`sheet-${props.id}`}>
        <div class="sheethead">
          <h2 id={titleId}>{props.title}</h2>
          {props.close !== false && (
            <button type="button" class="iconbtn" data-testid="sheet-close" aria-label={t('close')} onClick={() => router.closeSheet()}>
              <Icon name="close" />
            </button>
          )}
        </div>
        {props.children}
      </section>
    </div>
  );
}

/** Toast (§5.7): ink card, check icon, role=status, 3.6 s. */
export const toast = signal<{ text: string; id: string; n: number } | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastN = 0;
export function showToast(id: string, text: string, ms = 3600) {
  clearTimeout(toastTimer);
  toast.value = { id, text, n: ++toastN };
  log(`state:toast-${id}`);
  toastTimer = setTimeout(() => (toast.value = null), ms);
}

export function Toast() {
  const v = toast.value;
  if (!v) return null;
  return (
    <div class="toast" role="status" data-testid={`toast-${v.id}`} key={v.n}>
      <Icon name="check" />
      <span>{v.text}</span>
    </div>
  );
}

/** Logs a `state:` test hook line whenever `name` changes (change-only, like screen:). */
export function useStateHook(name: string | null) {
  useEffect(() => {
    if (name) log(`state:${name}`);
  }, [name]);
}
