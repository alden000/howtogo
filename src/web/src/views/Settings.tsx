import { Header } from '../app';
import { useServices, useT } from '../context';
import { canInstall, promptInstall } from '../pwa/install';
import { applyUpdate, updateReady } from '../pwa/register';
import { buildReport } from '../report';
import type { Settings as S } from '../state/store';

function Radio<K extends keyof S>(props: { name: K; value: S[K]; label: string }) {
  const { store } = useServices();
  return (
    <label>
      <input
        type="radio"
        name={props.name}
        data-testid={`setting-${props.name}-${String(props.value)}`}
        checked={store.settings.value[props.name] === props.value}
        onChange={() => store.updateSettings({ [props.name]: props.value } as Partial<S>)}
      />
      {props.label}
    </label>
  );
}

export function Settings() {
  const { store, platform } = useServices();
  const t = useT();
  const s = store.settings.value;
  return (
    <main>
      <Header title={t('settings')} />
      <fieldset>
        <legend>{t('language')}</legend>
        <Radio name="lang" value="zh" label="简体中文" /> <Radio name="lang" value="en" label="English" />
      </fieldset>
      <fieldset>
        <legend>{t('text_size')}</legend>
        <Radio name="textSize" value="standard" label={t('size_standard')} /> <Radio name="textSize" value="large" label={t('size_large')} />{' '}
        <Radio name="textSize" value="xlarge" label={t('size_xlarge')} />
      </fieldset>
      <fieldset>
        <legend>{t('theme')}</legend>
        <Radio name="theme" value="auto" label={t('theme_auto')} /> <Radio name="theme" value="light" label={t('theme_light')} />{' '}
        <Radio name="theme" value="dark" label={t('theme_dark')} />
      </fieldset>
      <fieldset>
        <legend>{t('voice')}</legend>
        <label>
          <input type="checkbox" data-testid="setting-muted" checked={s.muted} onChange={() => store.updateSettings({ muted: !s.muted })} />
          {t('mute')}
        </label>
      </fieldset>
      <p>
        {store.places.value.home && (
          <button type="button" data-testid="clear-home" onClick={() => store.setHome(undefined)}>
            {t('clear_home')}
          </button>
        )}{' '}
        <button type="button" data-testid="clear-recent" onClick={() => store.clearRecents()}>
          {t('clear_recent')}
        </button>
      </p>
      <p>
        {canInstall.value && (
          <button type="button" data-testid="install" onClick={() => promptInstall()}>
            {t('install')}
          </button>
        )}{' '}
        {updateReady.value && (
          <button type="button" data-testid="settings-update" onClick={applyUpdate}>
            {t('update_now')}
          </button>
        )}{' '}
        <button type="button" data-testid="report" onClick={() => platform.share('', buildReport(s))}>
          {t('report')}
        </button>
      </p>
      <section>
        <h2>{t('about')}</h2>
        <p>{t('attribution')}</p>
        <p>{t('privacy')}</p>
      </section>
    </main>
  );
}
