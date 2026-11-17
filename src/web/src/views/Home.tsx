/** H1 Home (STYLE-GUIDE §6 H1). Saved places beyond Home are M4. */
import { useEffect, useState } from 'preact/hooks';
import { haversine, type Place } from '@howtogo/shared';
import { useServices, useT } from '../context';
import { log } from '../log';
import { TEXT_SCALE, TEXT_SIZES } from '../state/store';
import { Icon, showToast, useStateHook, Wordmark } from '../ui/kit';

/** "Already near home" radius for Take me home (the too-close threshold of AC 34). */
export const NEAR_HOME_M = 200;

export function greetingKey(hour: number): 'greet_morning' | 'greet_afternoon' | 'greet_evening' {
  return hour < 12 ? 'greet_morning' : hour < 18 ? 'greet_afternoon' : 'greet_evening';
}

/** Hour in Singapore time (the app is SG-only). */
export const sgHour = (d = new Date()) =>
  Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Singapore' }).format(d));

/** Last known "where am I" for this tab: reverse-geocoded once, only if location permission is already granted. */
let here: { label: string; lat: number; lng: number } | null = null;

export function Home() {
  const { store, router, platform, api } = useServices();
  const t = useT();
  const s = store.settings.value;
  const home = store.places.value.home;
  const trip = store.trip.value;
  const [near, setNear] = useState(here);

  // "你在：…附近" — we never prompt for location from Home (AC 25: only on a user tap, after the explainer).
  useEffect(() => {
    if (here) return;
    let dead = false;
    (async () => {
      try {
        if ((await platform.location.permission()) !== 'granted') return;
        const f = await platform.location.current();
        log('loc:ok');
        const label = await api
          .revgeocode(f)
          .then((r) => r.name)
          .catch(() => null);
        if (!label || dead) return;
        here = { label, lat: f.lat, lng: f.lng };
        setNear(here);
      } catch {
        log('loc:fail');
      }
    })();
    return () => {
      dead = true;
    };
  }, []);

  const nearHome = !!(home && near && haversine(home, near) < NEAR_HOME_M);
  const nearLabel = nearHome ? t('home_tile') : near?.label;
  useStateHook(nearHome ? 'home-at-home' : near ? 'home-away' : 'home-default');

  const go = (to: Place) => {
    store.setPlan({ from: null, to, options: [] });
    router.navigate('/routes');
  };
  const takeMeHome = () => {
    if (!home) return;
    if (nearHome) return showToast('already-home', t('already_home'));
    go(home);
  };
  const greet = t(greetingKey(sgHour()));
  const pct = Math.round(TEXT_SCALE[s.textSize] * 100);
  const nextSize = TEXT_SIZES[(TEXT_SIZES.indexOf(s.textSize) + 1) % TEXT_SIZES.length]!;
  const today = new Date().toLocaleDateString(s.lang === 'zh' ? 'zh-CN' : 'en-SG', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Singapore',
  });

  return (
    <>
      <header class="bar">
        <Wordmark name={t('app_name')} />
        <span class="grow" />
        <button
          type="button"
          class="iconbtn"
          data-testid="lang-toggle"
          aria-label={t('lang_label')}
          lang={s.lang === 'zh' ? 'en' : 'zh'}
          onClick={() => store.updateSettings({ lang: s.lang === 'zh' ? 'en' : 'zh' })}
        >
          {t('lang_btn')}
        </button>
        <button
          type="button"
          class="iconbtn"
          data-testid="text-size"
          aria-label={t('text_btn_label', { n: pct })}
          onClick={() => store.updateSettings({ textSize: nextSize })}
        >
          <span aria-hidden="true" style={{ fontSize: '.8em' }}>
            A
          </span>
          <span aria-hidden="true" style={{ fontSize: '1.15em' }}>
            A
          </span>
        </button>
        <button type="button" class="iconbtn sq" data-testid="nav-settings" aria-label={t('settings')} onClick={() => router.openSheet('settings')}>
          <Icon name="sliders" />
        </button>
      </header>
      <main class="scroll">
        <div class="greet">
          <h2 class="t-display" data-testid="greeting">
            {s.name ? t('greet_named', { g: greet, n: s.name }) : greet}
          </h2>
          <p>{t('where_today')}</p>
          {nearLabel && (
            <div class="where" data-testid="where">
              <span class="dot" aria-hidden="true" />
              {t('you_are_near', { p: nearLabel })}
            </div>
          )}
        </div>
        {trip && trip.guidance.status !== 'arrived' && (
          <button
            type="button"
            class="btn btn-secondary small"
            style={{ marginBottom: 'var(--s-4)' }}
            data-testid="continue-trip"
            onClick={() => router.navigate('/guide')}
          >
            <Icon name="nav" />
            {t('continue_trip')}
          </button>
        )}
        <button type="button" class="searchbtn" data-testid="to-field" onClick={() => router.navigate('/search')}>
          <span class="mic" aria-hidden="true">
            <Icon name="mic" />
          </span>
          <span class="grow">{t('search_cta')}</span>
          <Icon name="search" />
        </button>
        {home && (
          <>
            <div class="sect">
              <h2>{t('my_places')}</h2>
              <span class="t-caption">{today}</span>
            </div>
            <div class="tiles">
              <button
                type="button"
                class="tile"
                data-k="home"
                data-testid="tile-home"
                aria-label={`${t('home_tile')}${t('sr_sep')}${home.name}`}
                onClick={() => go(home)}
              >
                <span class="ic">
                  <Icon name="home" />
                </span>
                <span class="nm">{t('home_tile')}</span>
                <span class="sub">{home.name}</span>
              </button>
            </div>
          </>
        )}
        <button type="button" class="helprow" data-testid="nav-help" onClick={() => router.navigate('/help')}>
          <span class="ic" aria-hidden="true">
            <Icon name="help" />
          </span>
          <span>
            <b>{t('help_row_t')}</b>
            <span>{t('help_row_s')}</span>
          </span>
        </button>
      </main>
      {home && (
        <div class="dock">
          <button type="button" class="btn btn-primary" data-testid="take-me-home" onClick={takeMeHome}>
            <Icon name="home" />
            {t('take_me_home')}
          </button>
        </div>
      )}
    </>
  );
}
