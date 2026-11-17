/**
 * H13 Settings sheet (STYLE-GUIDE §6 H13): language, text size, colours, reduce motion.
 * Voice/vibration rows land with M2 guidance. The block below the rows (Home, recents, install,
 * update, Report, About) keeps the shell's functions until Creative's §6b settings additions arrive.
 */
import { useServices, useT } from '../context';
import { canInstall, promptInstall } from '../pwa/install';
import { applyUpdate, updateReady } from '../pwa/register';
import { buildReport } from '../report';
import { TEXT_SCALE, TEXT_SIZES, type Settings } from '../state/store';
import { Sheet } from '../ui/kit';

function Seg<K extends keyof Settings>(props: { name: K; label: string; opts: [Settings[K], string][] }) {
  const { store } = useServices();
  const cur = store.settings.value[props.name];
  const id = `set-${String(props.name)}`;
  return (
    <div class="setrow">
      <h3 id={id}>{props.label}</h3>
      <div class="seg" role="group" aria-labelledby={id}>
        {props.opts.map(([v, l]) => (
          <button
            type="button"
            aria-pressed={cur === v}
            data-testid={`setting-${String(props.name)}-${String(v)}`}
            onClick={() => store.updateSettings({ [props.name]: v } as Partial<Settings>)}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsSheet() {
  const { store, platform } = useServices();
  const t = useT();
  const s = store.settings.value;
  return (
    <Sheet id="settings" title={t('settings')}>
      <Seg name="lang" label={t('set_lang')} opts={[['zh', '中文'], ['en', 'English']]} />
      <Seg name="textSize" label={t('set_text')} opts={TEXT_SIZES.map((v) => [v, `${Math.round(TEXT_SCALE[v] * 100)}%`])} />
      <Seg name="theme" label={t('set_theme')} opts={[['auto', t('theme_auto')], ['light', t('theme_light')], ['dark', t('theme_dark')]]} />
      <Seg name="motion" label={t('set_motion')} opts={[['auto', t('theme_auto')], ['on', t('on')], ['off', t('off')]]} />
      <div class="opts" style={{ marginTop: 'var(--s-6)' }}>
        {store.places.value.home && (
          <button type="button" class="btn btn-secondary small" data-testid="clear-home" onClick={() => store.setHome(undefined)}>
            {t('clear_home')}
          </button>
        )}
        {store.recents.value.length > 0 && (
          <button type="button" class="btn btn-secondary small" data-testid="clear-recent" onClick={() => store.clearRecents()}>
            {t('clear_recent')}
          </button>
        )}
        {canInstall.value && (
          <button type="button" class="btn btn-secondary small" data-testid="install" onClick={() => promptInstall()}>
            {t('install')}
          </button>
        )}
        {updateReady.value && (
          <button type="button" class="btn btn-secondary small" data-testid="settings-update" onClick={applyUpdate}>
            {t('update_now')}
          </button>
        )}
        <button type="button" class="btn btn-secondary small" data-testid="report" onClick={() => platform.share('', buildReport(s))}>
          {t('report')}
        </button>
      </div>
      <section style={{ marginTop: 'var(--s-6)' }}>
        <h3 class="t-label" style={{ color: 'var(--c-ink-2)', margin: '0 0 8px' }}>
          {t('about')}
        </h3>
        <p class="t-caption">{t('attribution')}</p>
        <p class="t-caption">{t('privacy')}</p>
      </section>
    </Sheet>
  );
}
