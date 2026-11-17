/** F2 Location permission: explainer (before the browser prompt) and denied help. Both are sheets (history entries). */
import { useState } from 'preact/hooks';
import { useServices, useT } from '../context';
import { locate } from '../state/location';
import { Icon, NumSteps, Sheet } from '../ui/kit';

/** OK → geolocate. Success closes the sheet (the screen underneath reacts to `here`); denial swaps in the help sheet. */
async function tryLocate(s: ReturnType<typeof useServices>) {
  const r = await locate(s.platform, s.api);
  if (r === 'denied') s.router.replaceSheet('loc-denied');
  else s.router.closeSheet();
}

export function LocExplainSheet() {
  const s = useServices();
  const t = useT();
  return (
    <Sheet
      id="loc-explain"
      title={t('loc_t')}
      close={false}
      top={
        <span class="bigtile" aria-hidden="true">
          <Icon name="loc" />
        </span>
      }
    >
      <p class="lead">{t('loc_b')}</p>
      <p class="lockline">
        <Icon name="lock" />
        <span>{t('loc_lock')}</span>
      </p>
      <div class="opts">
        <button type="button" class="btn btn-primary" data-testid="loc-ok" onClick={() => tryLocate(s)}>
          {t('ok')}
        </button>
        <button type="button" class="btn btn-secondary" data-testid="loc-type" onClick={() => s.router.navigate('/search?field=from')}>
          {t('loc_type')}
        </button>
      </div>
    </Sheet>
  );
}

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = () => typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;

export function LocDeniedSheet() {
  const s = useServices();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'android' | 'ios'>(isIOS() ? 'ios' : 'android');
  const android = standalone()
    ? [t('andapp_1'), t('andapp_2'), t('andapp_3'), t('and_4')]
    : [t('and_1'), t('and_2'), t('and_3'), t('and_4')];
  return (
    <Sheet id="loc-denied" title={t('den_t')}>
      <p class="lead">{t('den_b')}</p>
      <button type="button" class="btn btn-quiet" aria-expanded={open} data-testid="loc-how" onClick={() => setOpen(!open)}>
        {t('den_how')}
      </button>
      {open && (
        <div data-testid="loc-how-steps">
          <div class="seg tabs" role="group">
            <button type="button" aria-pressed={tab === 'android'} data-testid="loc-tab-android" onClick={() => setTab('android')}>
              {t('tab_android')}
            </button>
            <button type="button" aria-pressed={tab === 'ios'} data-testid="loc-tab-ios" onClick={() => setTab('ios')}>
              {t('tab_ios')}
            </button>
          </div>
          {tab === 'android' ? (
            <NumSteps items={android} />
          ) : (
            <>
              <NumSteps items={[t('ios_1'), t('ios_2'), t('and_3'), t('and_4')]} />
              <p class="t-caption">{t('ios_more')}</p>
            </>
          )}
        </div>
      )}
      <div class="opts" style={{ marginTop: 'var(--s-4)' }}>
        <button type="button" class="btn btn-primary" data-testid="loc-retry" onClick={() => tryLocate(s)}>
          {t('try_again')}
        </button>
        <button type="button" class="btn btn-secondary" data-testid="loc-type" onClick={() => s.router.navigate('/search?field=from')}>
          {t('type_place')}
        </button>
      </div>
    </Sheet>
  );
}
