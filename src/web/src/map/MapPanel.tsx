/**
 * Lazy map panel. Importing this component costs nothing: the map module and
 * MapLibre load only when it mounts. The map is aria-hidden; steps are the text alternative.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { LatLng, Step } from '@howtogo/shared';
import { useServices, useT } from '../context';
import type { MapController } from './map';

export interface MapPanelProps {
  steps: Step[];
  /** Live puck (guide); omit for a static route overview. */
  puck?: { pos: LatLng; acc?: number; heading?: number | null } | null;
  /** Changes when the guidance step changes → follow-me resumes. */
  stepIndex?: number;
}

export function isDark(theme: 'auto' | 'light' | 'dark'): boolean {
  if (theme !== 'auto') return theme === 'dark';
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function MapPanel({ steps, puck, stepIndex }: MapPanelProps) {
  const { store } = useServices();
  const t = useT();
  const el = useRef<HTMLDivElement>(null);
  const [ctl, setCtl] = useState<MapController | null>(null);
  const [failed, setFailed] = useState(false);
  const dark = isDark(store.settings.value.theme);

  useEffect(() => {
    let c: MapController | null = null;
    let dead = false;
    const reduced = document.documentElement.classList.contains('rm'); // OS setting or H13 override (main.tsx)
    import('./map')
      .then((m) => m.createMapController(el.current!, { dark, reducedMotion: reduced }))
      .then((m) => {
        if (dead) return m.destroy();
        c = m;
        setCtl(m);
      })
      .catch(() => setFailed(true));
    return () => {
      dead = true;
      c?.destroy();
    };
  }, []);

  useEffect(() => {
    if (!ctl) return;
    ctl.setRoute(steps);
    if (!puck) ctl.fitRoute();
  }, [ctl, steps]);
  useEffect(() => ctl?.setTheme(dark), [ctl, dark]);
  useEffect(() => {
    if (ctl && puck) ctl.setPuck(puck);
  }, [ctl, puck?.pos.lat, puck?.pos.lng, puck?.heading]);
  useEffect(() => {
    if (ctl && stepIndex !== undefined) ctl.stepChanged();
  }, [ctl, stepIndex]);

  return (
    <section class="mapbox" data-testid="map-box">
      <div ref={el} data-testid="map" aria-hidden="true" style={{ position: 'absolute', inset: 0 }} />
      {failed && <p class="t-caption" style={{ position: 'absolute', inset: 'auto var(--s-4) var(--s-4)' }}>{t('error_generic')}</p>}
      {ctl && puck && ctl.follow.value === 'free' && (
        <button type="button" class="iconbtn" style={{ position: 'absolute', top: 'var(--s-3)', right: 'var(--s-3)' }} data-testid="map-recentre" onClick={() => ctl.recentre()}>
          {t('recentre')}
        </button>
      )}
      {ctl && puck && (
        <button type="button" class="iconbtn" style={{ position: 'absolute', top: 'var(--s-3)', left: 'var(--s-3)' }} data-testid="map-overview" onClick={() => ctl.fitRoute()}>
          {t('overview')}
        </button>
      )}
    </section>
  );
}
