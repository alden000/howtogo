/**
 * Root component: picks the screen from the router and overlays the open sheet.
 * Screens follow creative/STYLE-GUIDE.md frames (H1–H4, H13); Guide/Share/Viewer/Help are
 * still shell placeholders (M2/M4).
 */
import { online } from './api/offline';
import { sampleMode } from './state/sample';
import { useServices, useT } from './context';
import { helpShare } from './state/helpShare';
import { Home } from './views/Home';
import { Confirm995Sheet, HelpSheet } from './views/helpSheet';
import { Bar, Icon, IconSprite, LiveRegion, Toast } from './ui/kit';
import { lazyView } from './ui/lazy';

// M5 AC 3/5: screens and sheets Home / the first run do not need are separate chunks (precached by the SW,
// warmed when idle by preloadViews() in main.tsx).
// M5 integration (AC 3 Home ≤ 100 KB): the first run is shown only right after the first download (so the
// network is there) and never again, so it is lazy. H2 Search is lazy too but fetched right after the first paint
// (main.tsx), not at idle. The Help sheet stays in the entry: it must open offline even before the service
// worker has precached the lazy chunks.
export const Search = lazyView(() => import('./views/Search').then((m) => m.Search));
const EndTripSheet = lazyView(() => import('./views/sheets').then((m) => m.EndTripSheet));
const Routes = lazyView(() => import('./views/Routes').then((m) => m.Routes));
const TripDetail = lazyView(() => import('./views/TripDetail').then((m) => m.TripDetail));
const Guide = lazyView(() => import('./views/Guide').then((m) => m.Guide));
const ShareStart = lazyView(() => import('./views/ShareStart').then((m) => m.ShareStart));
const Viewer = lazyView(() => import('./views/Viewer').then((m) => m.Viewer));
const Help = lazyView(() => import('./views/Help').then((m) => m.Help));
const settings = () => import('./views/Settings');
const About = lazyView(() => settings().then((m) => m.About));
// M5 UI-1: L1 Privacy page, L5 battery saver sheet.
const Privacy = lazyView(() => import('./views/Privacy').then((m) => m.Privacy));
const BatterySheet = lazyView(() => settings().then((m) => m.BatterySheet));
const ClearSheet = lazyView(() => settings().then((m) => m.ClearSheet));
const HomeSheet = lazyView(() => settings().then((m) => m.HomeSheet));
const InstallSheet = lazyView(() => settings().then((m) => m.InstallSheet));
const NameSheet = lazyView(() => settings().then((m) => m.NameSheet));
const ReportSheet = lazyView(() => settings().then((m) => m.ReportSheet));
const RoutePrefsSheet = lazyView(() => settings().then((m) => m.RoutePrefsSheet));
const SettingsScreen = lazyView(() => settings().then((m) => m.SettingsScreen));
const locSheets = () => import('./views/LocationSheets');
const LocDeniedSheet = lazyView(() => locSheets().then((m) => m.LocDeniedSheet));
const LocExplainSheet = lazyView(() => locSheets().then((m) => m.LocExplainSheet));
const JourneyBuilder = lazyView(() => import('./views/Journey').then((m) => m.JourneyBuilder));
const tripSheets = () => import('./views/tripSheets');
const AllStepsSheet = lazyView(() => tripSheets().then((m) => m.AllStepsSheet));
const DriverSheet = lazyView(() => tripSheets().then((m) => m.DriverSheet));
const DwellSheet = lazyView(() => tripSheets().then((m) => m.DwellSheet));
const StaleSheet = lazyView(() => tripSheets().then((m) => m.StaleSheet));
const VoiceHelpSheet = lazyView(() => tripSheets().then((m) => m.VoiceHelpSheet));
const ShareSheet = lazyView(() => import('./views/share').then((m) => m.ShareSheet));
const places = () => import('./views/places');
const PlaceRemoveSheet = lazyView(() => places().then((m) => m.PlaceRemoveSheet));
const PlaceRenameSheet = lazyView(() => places().then((m) => m.PlaceRenameSheet));
const PlacesScreen = lazyView(() => places().then((m) => m.PlacesScreen));
const transitSheets = () => import('./views/transit');
const DisruptionOfferSheet = lazyView(() => transitSheets().then((m) => m.DisruptionOfferSheet));
const LtaNoticeSheet = lazyView(() => transitSheets().then((m) => m.LtaNoticeSheet));
const familyViews = () => import('./views/family');
const DeleteAllSheet = lazyView(() => familyViews().then((m) => m.DeleteAllSheet));
const FamilyEdit = lazyView(() => familyViews().then((m) => m.FamilyEdit));
const FamilyList = lazyView(() => familyViews().then((m) => m.FamilyList));
const SetupFamily = lazyView(() => familyViews().then((m) => m.SetupFamily));
const SetupImport = lazyView(() => familyViews().then((m) => m.SetupImport));
const SetupStart = lazyView(() => familyViews().then((m) => m.SetupStart));
// M5 UI-2: L3 What's new, L4b picture guide, L4d iOS in-app-browser help (6f.3, 6f.4).
const launchViews = () => import('./views/launch');
const WhatsNewSheet = lazyView(() => launchViews().then((m) => m.WhatsNewSheet));
const InstallGuideSheet = lazyView(() => launchViews().then((m) => m.InstallGuideSheet));
const IabHelpSheet = lazyView(() => launchViews().then((m) => m.IabHelpSheet));

/** D-10: screens that show route data get the sample-routes banner while the Worker is in fixture mode. */
const SAMPLE_SCREENS = new Set(['home', 'search', 'routes']);
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { ghost } from './ui/ghost';
import { connectivityToasts } from './ui/toasts';
// QA-58 (AC 2): F1 is in the entry again — as a lazy chunk it added a request wave before the first-run LCP.
// Room in the 100 KB Home budget came from the trip-tile helpers (now lazy, main.tsx).
import { Welcome } from './views/Welcome';

export function App() {
  const { router, store, runtime, api, platform } = useServices();
  const t = useT();
  const r = router.route.value;
  // Creative m34-fix-b H1: a live help-only share keeps sending positions until 我没事了 or expiry.
  useEffect(() => helpShare.track(api, platform), []);
  // D8: Back onto the guidance guard opens the End-trip sheet while a trip runs; after arrival it goes Home.
  useEffect(
    () =>
      router.setGuard(() => {
        const tr = store.trip.peek();
        if (!tr) return 'pass';
        if (tr.phase !== 'arrived' && runtime.ui.peek().phase !== 'arrived') return 'sheet';
        void runtime.end(); // H12: Back → H1 and the stored trip is cleared (AC 47)
        return 'home';
      }),
    [],
  );
  const sheet = router.sheet.value;
  const depth = router.depth.value;
  useEffect(() => connectivityToasts(t), [t]);
  // Screen push/pop (§2): direction from the in-app history depth; the key remounts the screen so it animates in.
  // QA-58: the first screen on launch does not slide in (no navigation happened); an opacity-0 entrance held back
  // the first-run LCP. Only in-app navigation animates.
  const prev = useRef({ path: r.path, depth, dir: 'none' as 'push' | 'pop' | 'none' });
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
    const find = () => stage.current?.querySelector<HTMLElement>(':scope > .screen h1') ?? stage.current?.querySelector<HTMLElement>(':scope > .screen main');
    const focus = (h: HTMLElement) => {
      if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
      h.focus({ preventScroll: true });
    };
    const h = find();
    if (h) return focus(h);
    // M5: a lazy screen renders a moment later (its chunk loads): focus its heading as soon as it appears (≤ 3 s).
    const host = stage.current;
    if (!host || typeof MutationObserver === 'undefined') return;
    const mo = new MutationObserver(() => {
      const el = find();
      if (!el) return;
      mo.disconnect();
      if (document.activeElement === document.body || !document.activeElement) focus(el);
    });
    mo.observe(host, { childList: true, subtree: true });
    const stop = setTimeout(() => mo.disconnect(), 3000);
    return () => {
      clearTimeout(stop);
      mo.disconnect();
    };
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
    case 'privacy':
      view = <Privacy />;
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
    case 'journey':
      view = <JourneyBuilder />;
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
    case 'family':
      view = <FamilyList />;
      break;
    case 'family_edit':
      view = <FamilyEdit />;
      break;
    case 'setup_start':
      view = <SetupStart />;
      break;
    case 'setup':
      view = <SetupFamily />;
      break;
    case 'places':
      view = <PlacesScreen />;
      break;
    case 'setup_import':
      view = <SetupImport code={r.params.code!} />;
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
      <div class={prev.current.dir === 'none' ? 'screen' : `screen enter-${prev.current.dir}`} key={r.path} data-screen={r.name}>
        {!online.value && r.name === 'home' && (
          <p class="note" role="status" data-testid="offline-notice">
            {t('offline_notice')}
          </p>
        )}
        {sampleMode.value && SAMPLE_SCREENS.has(r.name) && (
          <p class="note sample" role="note" data-testid="sample-banner">
            <Icon name="info" />
            <span>{t('sample_banner')}</span>
          </p>
        )}
        {view}
      </div>
      {sheet === 'end-trip' && <EndTripSheet />}
      {sheet === 'help' && <HelpSheet />}
      {sheet === 'confirm-995' && <Confirm995Sheet />}
      {sheet === 'share' && <ShareSheet />}
      {sheet === 'lta-notice' && <LtaNoticeSheet />}
      {sheet === 'delete-all' && <DeleteAllSheet />}
      {sheet === 'dis-offer' && <DisruptionOfferSheet />}
      {sheet === 'all-steps' && <AllStepsSheet />}
      {sheet === 'driver' && <DriverSheet />}
      {sheet === 'voice-help' && <VoiceHelpSheet />}
      {sheet === 'stale-trip' && <StaleSheet />}
      {sheet === 'dwell' && (
        <DwellSheet
          onPick={(i, min) => {
            const stops = (store.plan.peek().stops ?? []).map((p, k) => (k === i ? { ...p, dwellMin: min } : p));
            store.setPlan({ stops, journey: undefined });
          }}
        />
      )}
      {sheet === 'loc-explain' && <LocExplainSheet />}
      {sheet === 'loc-denied' && <LocDeniedSheet />}
      {sheet === 'name' && <NameSheet />}
      {sheet === 'home' && <HomeSheet />}
      {sheet === 'place-rename' && <PlaceRenameSheet />}
      {sheet === 'place-remove' && <PlaceRemoveSheet />}
      {sheet === 'clear' && <ClearSheet />}
      {sheet === 'install' && <InstallSheet />}
      {sheet === 'report' && <ReportSheet />}
      {sheet === 'battery' && <BatterySheet />}
      {sheet === 'route-prefs' && <RoutePrefsSheet />}
      {sheet === 'whatsnew' && <WhatsNewSheet />}
      {sheet === 'install-guide' && <InstallGuideSheet />}
      {sheet === 'iab-help' && <IabHelpSheet />}
      <Toast />
      <LiveRegion />
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
