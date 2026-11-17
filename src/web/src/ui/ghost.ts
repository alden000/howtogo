/**
 * Exit motion (STYLE-GUIDE §2, Creative review #10): the outgoing screen slides −6 % / fades
 * (pop: +12 %), and a closing sheet drops with ease-in, both over --d-base (120 ms cross-fade under `.rm`).
 *
 * The router swaps screens and sheets at once (Back stays instant and testable), so the exit is played
 * by a *ghost*: a static copy of the old DOM inside a closed shadow root. It is inert, aria-hidden and
 * invisible to selectors, so screen readers, focus and tests only ever see the live screen.
 */
let sheet: CSSStyleSheet | null = null;
let sheetFor = -1;

function styles(): CSSStyleSheet[] {
  if (typeof CSSStyleSheet === 'undefined' || !('adoptedStyleSheets' in Document.prototype)) return [];
  if (!sheet || sheetFor !== document.styleSheets.length) {
    const css: string[] = [];
    for (const s of document.styleSheets) {
      try {
        for (const r of s.cssRules) css.push(r.cssText);
      } catch {
        /* cross-origin (fonts): @font-face already applies document-wide */
      }
    }
    sheet = new CSSStyleSheet();
    sheet.replaceSync(css.join('\n'));
    sheetFor = document.styleSheets.length;
  }
  return [sheet];
}

const reduced = () => document.documentElement.classList.contains('rm');

/** Plays `cls` on a copy of `el` above (`over`) or below the live content, then removes it. */
export function ghost(el: Element | null, cls: string, opts: { over?: boolean } = {}): void {
  if (!el || typeof document === 'undefined' || !el.parentElement) return;
  const adopted = styles();
  if (!adopted.length) return;
  const host = document.createElement('div');
  host.className = 'ghost';
  host.setAttribute('aria-hidden', 'true');
  host.inert = true;
  const root = host.attachShadow({ mode: 'closed' });
  root.adoptedStyleSheets = adopted;
  const copy = el.cloneNode(true) as HTMLElement;
  // Keep each scroller where it was so the copy matches what was on screen.
  const from = el.querySelectorAll('.scroll,.sheet');
  const to = copy.querySelectorAll('.scroll,.sheet');
  copy.classList.remove('enter-push', 'enter-pop');
  copy.classList.add(...(reduced() ? ['leave-fade'] : cls.split(' ')));
  root.appendChild(copy);
  // Two empty layers rendered by App (Preact never diffs children it did not render).
  const layer = el.closest('.stage')?.querySelector(opts.over ? ':scope > .ghosts.over' : ':scope > .ghosts:not(.over)');
  if (!layer) return;
  layer.appendChild(host);
  from.forEach((s, i) => to[i] && (to[i]!.scrollTop = s.scrollTop));
  setTimeout(() => host.remove(), reduced() ? 120 : 280);
}
