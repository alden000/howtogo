/**
 * H5 follow-me map (STYLE-GUIDE §6c.0, AC 13–18). The runtime owns the follow mode
 * (`runtime.ui.follow`): a gesture calls `onGesture` (→ free), Follow / step change
 * re-engage it; nothing here is timer-based. The map stays aria-hidden: the step card
 * is the accessible source of truth.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { powerPolicy, type LatLng, type Step } from '@howtogo/shared';
import { useServices } from '../context';
import { isDark } from './MapPanel';
import type { MapController, PuckInput } from './map';
import type { FollowMode } from './follow';

export interface GuideMapProps {
  steps: Step[];
  puck: (PuckInput & { pos: LatLng }) | null;
  stepIndex: number;
  mode: FollowMode;
  /** Increments on each "See whole trip" tap. */
  overview: number;
  padding: { top: number; bottom: number };
  zoom: number;
  /** Pocket view: no camera work at all. */
  paused: boolean;
  onGesture: () => void;
}

export function GuideMap(p: GuideMapProps) {
  const { store, runtime } = useServices();
  const el = useRef<HTMLDivElement>(null);
  const attrib = useRef<HTMLDivElement>(null);
  const [ctl, setCtl] = useState<MapController | null>(null);
  const dark = isDark(store.settings.value.theme);
  const gesture = useRef(p.onGesture);
  gesture.current = p.onGesture;

  useEffect(() => {
    let c: MapController | null = null;
    let dead = false;
    const reduced = document.documentElement.classList.contains('rm');
    import('./map')
      .then((m) => m.createMapController(el.current!, { dark, reducedMotion: reduced, animations: () => powerPolicy(runtime.power.peek().saver).mapAnimations, attributionHost: attrib.current!, onGesture: () => gesture.current() }))
      .then((m) => {
        if (dead) return m.destroy();
        c = m;
        setCtl(m);
      })
      .catch(() => {});
    return () => {
      dead = true;
      c?.destroy();
    };
  }, []);

  useEffect(() => ctl?.setRoute(p.steps), [ctl, p.steps]);
  useEffect(() => ctl?.setTheme(dark), [ctl, dark]);
  useEffect(() => {
    if (!ctl || p.paused) return;
    ctl.resize();
    ctl.setPadding(p.padding);
  }, [ctl, p.padding.top, p.padding.bottom, p.paused]);
  useEffect(() => {
    if (ctl && !p.paused) ctl.setFollowZoom(p.zoom);
  }, [ctl, p.zoom, p.paused]);
  useEffect(() => {
    if (ctl && p.puck && !p.paused) ctl.setPuck(p.puck);
  }, [ctl, p.puck?.pos.lat, p.puck?.pos.lng, p.puck?.heading, p.puck?.stale, p.puck?.acc, p.paused]);
  useEffect(() => {
    if (!ctl || p.paused) return;
    if (p.mode === 'follow') ctl.setFollow('follow');
    else ctl.setFollow('free');
  }, [ctl, p.mode, p.stepIndex, p.paused]);
  useEffect(() => {
    if (ctl && p.overview > 0) ctl.fitRoute({ margin: 48 });
  }, [ctl, p.overview]);

  return (
    <>
      <div ref={el} class="mapcanvas" data-testid="map" aria-hidden="true" />
      <div ref={attrib} class="attribhost" />
    </>
  );
}
