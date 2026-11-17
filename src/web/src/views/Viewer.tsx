/** Family viewer (public, /t/:id): live state over WebSocket with reconnect. Placeholder markup. */
import { useEffect, useState } from 'preact/hooks';
import type { ShareState } from '../api/types';
import { useServices, useT } from '../context';
import { log } from '../log';

export function Viewer({ id }: { id: string }) {
  const { api } = useServices();
  const t = useT();
  const [state, setState] = useState<ShareState | null>(null);
  const [ended, setEnded] = useState(false);
  const [conn, setConn] = useState('connecting');

  useEffect(() => {
    const c = api.shareLive(id, (e) => {
      if (e.type === 'state') {
        setState(e.state);
        log(`viewer:${e.state.status}`);
      } else if (e.type === 'ended' || e.type === 'expired') {
        setEnded(true);
        log('viewer:ended');
      } else if (e.type === 'connection') setConn(e.status);
    });
    return () => c.close();
  }, [id]);

  return (
    <main>
      <h1>{t('app_name')}</h1>
      {ended ? (
        <p data-testid="viewer-ended">{t('viewer_ended')}</p>
      ) : !state || state.lat == null ? (
        <p data-testid="viewer-waiting">{t('viewer_waiting')}</p>
      ) : (
        <dl data-testid="viewer-state">
          <dt>{t('to')}</dt>
          <dd>{state.destName}</dd>
          <dt>Status</dt>
          <dd data-testid="viewer-status">{state.status}</dd>
          {state.stepText && (
            <>
              <dt>{t('steps')}</dt>
              <dd>{state.stepText}</dd>
            </>
          )}
          {state.etaISO && (
            <>
              <dt>ETA</dt>
              <dd>{new Date(state.etaISO).toLocaleTimeString()}</dd>
            </>
          )}
        </dl>
      )}
      <p>
        <small>{conn}</small>
      </p>
    </main>
  );
}
