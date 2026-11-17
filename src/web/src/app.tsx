/**
 * Root component: picks the screen from the router and overlays the open sheet.
 * Placeholder views are bare semantic HTML on purpose — the UI round builds the
 * real screens from creative/STYLE-GUIDE.md.
 */
import { online } from './api/offline';
import { useServices, useT } from './context';
import { justUpdated, updateReady, applyUpdate } from './pwa/register';
import { EndTripSheet } from './views/sheets';
import { Home } from './views/Home';
import { Search } from './views/Search';
import { Routes } from './views/Routes';
import { TripDetail } from './views/TripDetail';
import { Guide } from './views/Guide';
import { ShareStart } from './views/ShareStart';
import { Viewer } from './views/Viewer';
import { Help } from './views/Help';
import { Settings } from './views/Settings';

export function App() {
  const { router } = useServices();
  const t = useT();
  const r = router.route.value;
  const sheet = router.sheet.value;
  let view;
  switch (r.name) {
    case 'home':
      view = <Home />;
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
    case 'settings':
      view = <Settings />;
      break;
    default:
      view = (
        <main>
          <h1>404</h1>
          <button type="button" data-testid="go-home" onClick={() => router.navigate('/', { replace: true })}>
            {t('app_name')}
          </button>
        </main>
      );
  }
  return (
    <>
      {!online.value && (
        <p role="status" data-testid="offline-notice">
          {t('offline_notice')}
        </p>
      )}
      {updateReady.value && (
        <p role="status">
          {t('update_ready')}{' '}
          <button type="button" data-testid="sw-update" onClick={applyUpdate}>
            {t('update_now')}
          </button>
        </p>
      )}
      {justUpdated.value && <p role="status">{t('updated')}</p>}
      {view}
      {sheet === 'end-trip' && <EndTripSheet />}
    </>
  );
}

/** Shared header with a labelled Back button (in-app history). */
export function Header({ title }: { title: string }) {
  const { router } = useServices();
  const t = useT();
  return (
    <header>
      <button type="button" data-testid="back" aria-label={t('back')} onClick={() => router.back()}>
        {t('back')}
      </button>
      <h1>{title}</h1>
    </header>
  );
}
