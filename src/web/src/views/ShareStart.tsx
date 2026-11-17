import { useState } from 'preact/hooks';
import { Header } from '../app';
import { useServices, useT } from '../context';

export function ShareStart() {
  const { store, runtime, platform } = useServices();
  const t = useT();
  const trip = store.trip.value;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const share = trip?.share;
  const url = share ? new URL(share.viewPath, location.origin).toString() : '';

  return (
    <main>
      <Header title={t('share_trip')} />
      {!trip && <p>{t('share_none')}</p>}
      {trip && !share && (
        <button
          type="button"
          data-testid="share-create"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(false);
            try {
              await runtime.startShare();
            } catch {
              setError(true);
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('share_start')}
        </button>
      )}
      {error && <p role="alert">{t('error_generic')}</p>}
      {share && (
        <section>
          <p>
            <a href={url} data-testid="share-link">
              {url}
            </a>
          </p>
          <button type="button" data-testid="share-send" onClick={() => platform.share(url, t('share_trip'))}>
            {t('share_send')}
          </button>{' '}
          <button type="button" data-testid="share-stop" onClick={() => runtime.stopShare()}>
            {t('share_stop')}
          </button>
        </section>
      )}
    </main>
  );
}
