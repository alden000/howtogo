/**
 * Root component: picks the screen from the router and overlays the open sheet.
 * Screens follow creative/STYLE-GUIDE.md frames (H1–H4, H13); Guide/Share/Viewer/Help are
 * still shell placeholders (M2/M4).
 */
import { online } from './api/offline';
import { useServices, useT } from './context';
import { EndTripSheet } from './views/sheets';
import { Home } from './views/Home';
import { Search } from './views/Search';
import { Routes } from './views/Routes';
import { TripDetail } from './views/TripDetail';
import { Guide } from './views/Guide';
import { ShareStart } from './views/ShareStart';
import { Viewer } from './views/Viewer';
import { Help } from './views/Help';
import { About, ClearSheet, HomeSheet, InstallSheet, NameSheet, ReportSheet, SettingsScreen } from './views/Settings';
import { LocDeniedSheet, LocExplainSheet } from './views/LocationSheets';
import { Welcome } from './views/Welcome';
import { Bar, IconSprite, Toast } from './ui/kit';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { ghost } from './ui/ghost';
import { connectivityToasts } from './ui/toasts';

export function App() {
  const { router } = useServices();
  const t = useT();
  const r = router.route.value;
  const sheet = router.sheet.value;
  const depth = router.depth.value;
  useEffect(() => connectivityToasts(t), [t]);
  // Screen push/pop (§2): direction from the in-app history depth; the key remounts the screen so it animates in.
  const prev = useRef({ path: r.path, depth, dir: 'push' as 'push' | 'pop' });
  const stage = useRef<HTMLDivElement>(null);
  const lastSheet = useRef(sheet);
  if (prev.current.path !== r.path) {
    prev.current = { path: r.path, depth, dir: depth < prev.current.depth ? 'pop' : 'push' };
    // Exit motion: the old screen is still in the DOM during this render (ui/ghost.ts).
    ghost(stage.current?.querySelector(':scope > .screen') ?? null, `leave-${prev.current.dir}`);
  } else prev.current.depth = depth;
  if (lastSheet.current !== sheet) {
    if (lastSheet.current) ghost(stage.current?.querySelector(':scope > .sheetwrap') ?? null, 'closing', { over: true });
    lastSheet.current = sheet;
  }
  // QA-6: on a new screen, move focus to its heading so screen readers announce it (not on first load).
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) return void (first.current = false);
    const h = stage.current?.querySelector<HTMLElement>(':scope > .screen h1') ?? stage.current?.querySelector<HTMLElement>(':scope > .screen main');
    if (!h) return;
    if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
    h.focus({ preventScroll: true });
  }, [r.path]);
  let view;
  switch (r.name) {
    case 'home':
      view = <Home />;
      break;
    case 'settings':
      view = <SettingsScreen />;
      break;
    case 'about':
      view = <About />;
      break;
    case 'welcome':
      view = <Welcome />;
      break;
    case 'search':
      view = <Search />;
      break;
    case 'routes':
      view = <Routes />;
      break;
    case 'trip':
      view = <TripDetail />;
      break;
    case 'guide':
      view = <Guide />;
      break;
    case 'share_start':
      view = <ShareStart />;
      break;
    case 'viewer':
      view = <Viewer id={r.params.id!} />;
      break;
    case 'help':
      view = <Help />;
      break;
    default:
      view = (
        <main class="scroll">
          <h1 class="t-title">404</h1>
          <button type="button" class="btn btn-secondary" data-testid="go-home" onClick={() => router.navigate('/', { replace: true })}>
            {t('app_name')}
          </button>
        </main>
      );
  }
  return (
    <div class="stage" ref={stage}>
      <div class="ghosts" />
      <IconSprite />
      <div class={`screen enter-${prev.current.dir}`} key={r.path} data-screen={r.name}>
        {!online.value && r.name === 'home' && (
          <p class="note" role="status" data-testid="offline-notice">
            {t('offline_notice')}
          </p>
        )}
        {view}
      </div>
      {sheet === 'end-trip' && <EndTripSheet />}
      {sheet === 'loc-explain' && <LocExplainSheet />}
      {sheet === 'loc-denied' && <LocDeniedSheet />}
      {sheet === 'name' && <NameSheet />}
      {sheet === 'home' && <HomeSheet />}
      {sheet === 'clear' && <ClearSheet />}
      {sheet === 'install' && <InstallSheet />}
      {sheet === 'report' && <ReportSheet />}
      <Toast />
      <div class="ghosts over" />
    </div>
  );
}

/** Shared header with the labelled Back button (in-app history). Title is the screen heading. */
export function Header({ title }: { title: string }) {
  return (
    <>
      <Bar />
      <h1 class="t-title" style={{ margin: '0 var(--s-5) var(--s-2)' }}>
        {title}
      </h1>
    </>
  );
}
