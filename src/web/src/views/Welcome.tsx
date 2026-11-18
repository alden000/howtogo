/** F1 First run (one time, 3 pages, skippable). Each page is a history entry; page 1 is the root. */
import { useEffect, useState } from 'preact/hooks';
import { useServices, useT } from '../context';
import { tf } from '../i18n/ui';
import { here, locate } from '../state/location';
import { TEXT_SIZES, type TextSize } from '../state/store';
import { Icon, showToast } from '../ui/kit';
import { HomeConfirm } from './HomeConfirm';
import { pendingHome } from '../state/pendingHome';

const SIZE_KEY: Record<TextSize, 'size_85' | 'size_100' | 'size_125' | 'size_150' | 'size_200'> = {
  small: 'size_85',
  standard: 'size_100',
  large: 'size_125',
  xlarge: 'size_150',
  xxlarge: 'size_200',
};
const PCT: Record<TextSize, string> = { small: '85%', standard: '100%', large: '125%', xlarge: '150%', xxlarge: '200%' };

export function Welcome() {
  const { store, router, platform, api } = useServices();
  const t = useT();
  const page = Math.min(3, Math.max(1, Number(router.route.value.query.get('p')) || 1));
  const s = store.settings.value;
  const [name, setName] = useState(s.name);
  const [wantHere, setWantHere] = useState(false);

  const finish = (toast = false) => {
    store.updateSettings({ onboarded: true });
    router.reset('/');
    if (toast) showToast('home-set', t('toast_home_set'));
  };
  const next = () => router.navigate(`/welcome?p=${page + 1}`);

  // "Use where I am now": explainer first unless permission is already granted (F2), then reverse geocode.
  const useHere = async () => {
    if ((await platform.location.permission().catch(() => 'prompt')) === 'granted') {
      if ((await locate(platform, api)) === 'ok') setWantHere(true);
      return;
    }
    setWantHere(true);
    router.openSheet('loc-explain');
  };
  useEffect(() => {
    const h = here.value;
    if (wantHere && h && !router.sheet.value) {
      pendingHome.value = { name: h.label ?? t('where_now'), lat: h.lat, lng: h.lng };
      setWantHere(false);
    }
  }, [wantHere, here.value, router.sheet.value]);

  const bi = (k: 'fr_hello' | 'fr_lang' | 'fr_size') => (
    <>
      <span lang="zh-CN">{tf('zh', k)}</span> / <span lang="en">{tf('en', k)}</span>
    </>
  );

  return (
    <>
      <header class="bar">
        <span class="dots" role="img" aria-label={t('fr_step', { n: page })}>
          {[1, 2, 3].map((n) => (
            <i class={n <= page ? 'on' : ''} />
          ))}
        </span>
        <span class="grow" />
        <button type="button" class="btn-quiet" data-testid="fr-skip" aria-label={t('fr_skip_sr')} onClick={() => finish()}>
          {t('fr_skip')}
        </button>
      </header>
      <main class="scroll">
        {page === 1 && (
          <>
            <h1 class="t-title" style={{ margin: '0 0 var(--s-4)' }}>
              <span lang="zh-CN">{tf('zh', 'fr_hello')}</span>
              <br />
              <span lang="en">{tf('en', 'fr_hello')}</span>
            </h1>
            <h2 class="grp" id="fr-lang">
              {bi('fr_lang')}
            </h2>
            <div class="radiogrid" role="radiogroup" aria-labelledby="fr-lang">
              {(['zh', 'en'] as const).map((l) => (
                <button
                  type="button"
                  role="radio"
                  class="radiocard"
                  lang={l === 'zh' ? 'zh-CN' : 'en'}
                  aria-checked={s.lang === l}
                  data-testid={`fr-lang-${l}`}
                  onClick={() => store.updateSettings({ lang: l })}
                >
                  {l === 'zh' ? '中文' : 'English'}
                  {s.lang === l && <Icon name="check" />}
                </button>
              ))}
            </div>
            <h2 class="grp" id="fr-size">
              {bi('fr_size')}
            </h2>
            <div class="radiogrid" role="radiogroup" aria-labelledby="fr-size">
              {TEXT_SIZES.map((z) => (
                <button
                  type="button"
                  role="radio"
                  class="radiocard"
                  aria-checked={s.textSize === z}
                  data-testid={`fr-size-${z}`}
                  onClick={() => store.updateSettings({ textSize: z })}
                >
                  <span>
                    <span lang="zh-CN">
                      {tf('zh', SIZE_KEY[z])} {PCT[z]}
                    </span>{' '}
                    / <span lang="en">{tf('en', SIZE_KEY[z])}</span>
                  </span>
                  {s.textSize === z && <Icon name="check" />}
                </button>
              ))}
            </div>
            {/* Creative M5 review fix 5: the 85 % caption sits directly under the size cards, above the fold. */}
            {s.textSize === 'small' && (
              <p class="t-caption" style={{ color: 'var(--c-ink-2)', margin: 'var(--s-2) 0 0' }} data-testid="size-85-note">
                {t('size_85_note')}
              </p>
            )}
            <div class="confirm" style={{ marginTop: 'var(--s-4)' }}>
              <p class="t-display" style={{ margin: 0 }} data-testid="fr-preview">
                {t('fr_preview')}
              </p>
            </div>
          </>
        )}
        {page === 2 && (
          <>
            <h1 class="t-title" style={{ margin: '0 0 var(--s-3)' }}>
              {t('fr_name_t')}
            </h1>
            <p class="sbody" style={{ color: 'var(--c-ink-2)' }}>
              {t('fr_name_b')}
            </p>
            <label class="t-label" for="fr-name">
              {t('name_label')}
            </label>
            <input
              id="fr-name"
              class="textin"
              data-testid="fr-name"
              maxLength={20}
              placeholder={t('name_ph')}
              value={name}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
            />
          </>
        )}
        {page === 3 && (
          <>
            <h1 class="t-title" style={{ margin: '0 0 var(--s-3)' }}>
              {t('fr_home_t')}
            </h1>
            <p style={{ color: 'var(--c-ink-2)' }}>{t('fr_home_b')}</p>
            {pendingHome.value ? (
              <HomeConfirm onDone={() => finish(true)} />
            ) : (
              <div class="opts">
                <button type="button" class="row big" data-testid="fr-home-search" onClick={() => router.navigate('/search?mode=home')}>
                  <Icon name="search" />
                  <span class="tx">{t('home_search')}</span>
                  <Icon name="chev" />
                </button>
                <button type="button" class="row big" data-testid="fr-home-here" onClick={useHere}>
                  <Icon name="loc" />
                  <span class="tx">{t('use_here')}</span>
                  <Icon name="chev" />
                </button>
                <button type="button" class="btn btn-quiet" data-testid="fr-home-later" onClick={() => finish()}>
                  {t('later')}
                </button>
              </div>
            )}
          </>
        )}
      </main>
      {page < 3 && (
        <div class="dock">
          <button
            type="button"
            class="btn btn-primary"
            data-testid="fr-next"
            onClick={() => {
              if (page === 2) store.updateSettings({ name: name.trim().slice(0, 20) });
              next();
            }}
          >
            {t('fr_next')}
          </button>
          {page === 2 && (
            <button type="button" class="btn btn-secondary" data-testid="fr-no-thanks" onClick={() => (store.updateSettings({ name: '' }), next())}>
              {t('no_thanks')}
            </button>
          )}
        </div>
      )}
    </>
  );
}
