/**
 * 6h.8 D2 Get-the-app card (web app on Android Chrome / Samsung Internet, top of Settings). QA-74: part of the
 * Settings chunk (not the lazy M6 chunk), so it is in Settings' first paint and never pushes the list down.
 */
import { useServices } from '../context';
import { D2_EN, D2_ZH } from '../i18n/m6d2';
import { flags, setFlags } from '../m6/core';
import { Icon } from '../ui/kit';
import '../styles/getapp.css';

export function GetAppCard() {
  const { store } = useServices();
  if (flags.value.getAppDismissed || store.trip.value) return null;
  const L = store.settings.value.lang === 'en' ? D2_EN : D2_ZH;
  return (
    <section class="card m6card" data-testid="d2-card" aria-labelledby="d2-t">
      <span class="bigtile" aria-hidden="true">
        <Icon name="smartphone" />
      </span>
      <h2 id="d2-t">{L.d2_t}</h2>
      <p class="lead">{L.d2_b}</p>
      <div class="opts">
        <a class="btn btn-primary" href="/android" data-testid="d2-go">
          {L.d2_go}
        </a>
        <button type="button" class="btn btn-quiet" data-testid="d2-no" onClick={() => setFlags({ getAppDismissed: true })}>
          {L.d2_no}
        </button>
      </div>
    </section>
  );
}
