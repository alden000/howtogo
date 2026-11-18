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
    // Creative R2: `:root[...]` rules never match inside a shadow root → retarget them to the `.groot` wrapper.
    sheet.replaceSync(css.join('\n').replace(/:root\b/g, '.groot'));
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
  // The wrapper carries <html>'s classes and attributes so the `.groot[...]` rules (text size, theme, `.rm`) apply.
  const w = document.createElement('div');
  w.className = ('groot ' + document.documentElement.className).trim();
  for (const a of ['data-theme', 'data-text-size']) {
    const v = document.documentElement.getAttribute(a);
    if (v) w.setAttribute(a, v);
  }
  w.appendChild(copy);
  root.appendChild(w);
  // Two empty layers rendered by App (Preact never diffs children it did not render).
  const layer = el.closest('.stage')?.querySelector(opts.over ? ':scope > .ghosts.over' : ':scope > .ghosts:not(.over)');
  if (!layer) return;
  layer.appendChild(host);
  from.forEach((s, i) => to[i] && (to[i]!.scrollTop = s.scrollTop));
  const stage = el.closest('.stage');
  const ms = reduced() ? 120 : 280;
  // M5: a lazy screen may render a moment later (its chunk loads). The exit motion's clock starts when the new
  // screen has content (≤ 3 s), so the hand-over looks exactly as with an eager screen and the stage is never empty.
  const settled = () => {
    const screen = stage?.querySelector(':scope > .screen');
    return !screen || screen.childElementCount > (screen.querySelector(':scope > .note') ? 1 : 0);
  };
  if (typeof MutationObserver === 'undefined' || !stage) {
    setTimeout(() => host.remove(), ms);
    return;
  }
  let started = false;
  let mo: MutationObserver | null = null;
  let cap: ReturnType<typeof setTimeout> | undefined;
  const start = () => {
    if (started) return;
    started = true;
    mo?.disconnect();
    clearTimeout(cap);
    setTimeout(() => host.remove(), ms);
  };
  // ghost() runs while App renders; the new screen is in the DOM one task later.
  setTimeout(() => {
    if (settled()) return start();
    mo = new MutationObserver(() => settled() && start());
    mo.observe(stage, { childList: true, subtree: true });
    cap = setTimeout(start, 3000);
  }, 0);
}
