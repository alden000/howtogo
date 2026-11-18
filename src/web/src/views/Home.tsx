/** H1 Home (STYLE-GUIDE §6 H1). Saved places beyond Home are M4. */
import { useEffect, useState } from 'preact/hooks';
import { haversine, type Place } from '@howtogo/shared';
import { useServices, useT } from '../context';
import { applyUpdate, updateBar } from '../pwa/register';
import { here, locate } from '../state/location';
import { nextAaSize, TEXT_SCALE } from '../state/store';
import { HomeConfirm } from './HomeConfirm';
import { Icon, showToast, useStateHook, Wordmark } from '../ui/kit';

/** "Already near home" radius for Take me home (the too-close threshold of AC 34). */
import { lazyView } from '../ui/lazy';

// M5 AC 3: shown only when there is a disruption / a just-imported setup: separate chunks, warmed when idle.
const DisruptionBanner = lazyView(() => import('./transit').then((m) => m.DisruptionBanner));
const SetupUndo = lazyView(() => import('./family').then((m) => m.SetupUndo));
import { family } from '../state/family';
import { refreshAlerts, refreshLifts } from '../transit/live';
import { relDate } from '../transit/m3';
import { HOME_RECENTS, toLang } from '../state/store';
import { placeKind, type PlaceKind } from '../state/places';
import { HelpNote } from './helpSheet';
import type { IconName } from '../ui/kit';

const KIND_ICON: Record<PlaceKind, IconName> = { clinic: 'clinic', market: 'market', daughter: 'family', other: 'loc' };
export const NEAR_HOME_M = 200;

export function greetingKey(hour: number): 'greet_morning' | 'greet_afternoon' | 'greet_evening' {
  return hour < 12 ? 'greet_morning' : hour < 18 ? 'greet_afternoon' : 'greet_evening';
}

/** Hour in Singapore time (the app is SG-only). */
export const sgHour = (d = new Date()) =>
  Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Singapore' }).format(d));

export function Home() {
  const { store, router, platform, api, flags } = useServices();
  const t = useT();
  const s = store.settings.value;
  const home = store.places.value.home;
  const others = store.places.value.others;
  const trip = store.trip.value;
  const recents = store.recents.value;
  const near = here.value;
  const plan = store.plan.value;
  const [bannerOff, setBannerOff] = useState(false);

 useEffect(() => {
    void refreshAlerts(api);
    refreshLifts(api);
  }, []);
  // "你在：…附近" — reverse-geocode only if permission is already granted; never prompt from Home (AC 25, F2).
  useEffect(() => {
    if (here.value) return;
    platform.location
      .permission()
      .then((p) => (p === 'granted' ? locate(platform, api) : null))
      .catch(() => null);
  }, []);

  const nearHome = !!(home && near && haversine(home, near) < NEAR_HOME_M);
  // F8: the location pill is the From field. Typed origin > "near {label}" > "From: My location".
  const pillText = plan.from
    ? t('from_here', { p: plan.from.name })
    : nearHome
      ? t('you_are_near', { p: t('home_tile') })
      : near?.label
        ? t('you_are_near', { p: near.label })
        : t('from_here', { p: t('my_location') });
  const fromLabel = plan.from?.name ?? (nearHome ? t('home_tile') : near?.label ?? t('my_location'));
  useStateHook(nearHome ? 'home-at-home' : near ? 'home-away' : 'home-default');

  const go = (to: Place) => {
    // A new destination starts a new plan: the G2 stop list is kept only until H1 (6c.3).
    store.setPlan({ to, options: [], stops: undefined, journey: undefined });
    router.navigate('/routes');
  };
  const takeMeHome = () => {
    if (!home) return;
    if (nearHome) return showToast('already-home', t('already_home'));
    go(home);
  };
  const greet = t(greetingKey(sgHour()));
  const pct = Math.round(TEXT_SCALE[s.textSize] * 100);
  // 6f.11: AA cycles 100 → 125 → 150 → 200 → 100 and never lands on 85 % (from 85 % it goes to 100 %).
  const nextSize = nextAaSize(s.textSize);
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
        <button type="button" class="iconbtn sq" data-testid="nav-settings" aria-label={t('settings')} onClick={() => router.navigate('/settings')}>
          <Icon name="sliders" />
        </button>
      </header>
      <main class="scroll">
        <SetupUndo />
        <DisruptionBanner where="home" />
        {updateBar.value && !bannerOff && (
          <div class="banner" data-testid="update-banner">
            <button type="button" data-testid="sw-update" aria-label={t('upd_sr')} onClick={applyUpdate}>
              <Icon name="refresh" />
              <span>{t('upd_banner')}</span>
            </button>
            <button type="button" class="iconbtn sq" data-testid="update-later" aria-label={t('upd_later')} onClick={() => setBannerOff(true)}>
              <Icon name="close" />
            </button>
          </div>
        )}
        <HomeConfirm />
        <div class="greet">
          <h2 class="t-display" data-testid="greeting">
            {s.name ? t('greet_named', { g: greet, n: s.name }) : greet}
          </h2>
          <p>{t('where_today')}</p>
          <button type="button" class="where" data-testid="from-field" aria-label={t('from_sr', { p: fromLabel })} onClick={() => router.navigate('/search?field=from')}>
            <span class="dot" aria-hidden="true" />
            {pillText}
          </button>
        </div>
        {trip && trip.guidance.status !== 'arrived' && (
          <button
            type="button"
            class="btn btn-secondary small"
            style={{ marginBottom: 'var(--s-4)' }}
            data-testid="continue-trip"
            onClick={() => router.enterGuide()}
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
        {(home || others.length > 0) && (
          <>
            <div class="sect">
              <h2>{t('my_places')}</h2>
              <span class="t-caption">{today}</span>
            </div>
            <div class="tiles">
              {home && (
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
              )}
              {/* QA-40 (AC 39): the other saved places follow Home, in the order set in Settings → My places. */}
              {others.map((p, i) => {
                const k = placeKind(p.label);
                return (
                  <button type="button" class="tile" data-k={k} data-testid={`tile-place-${i}`} aria-label={p.label !== p.name ? `${p.label}${t('sr_sep')}${p.name}` : p.label} onClick={() => go(p)}>
                    <span class="ic">
                      <Icon name={KIND_ICON[k]} />
                    </span>
                    <span class="nm">{p.label}</span>
                    {p.label !== p.name && <span class="sub">{p.name}</span>}
                  </button>
                );
              })}
              {/* Creative m34-fix-b L6: places but no Home → a 5.1 "Add a place"-style tile to set Home. */}
              {!home && others.length > 0 && (
                <button type="button" class="tile tile-add" data-testid="tile-set-home" onClick={() => router.navigate('/search?mode=home')}>
                  <span class="ic" aria-hidden="true">
                    <Icon name="home" />
                  </span>
                  <span class="nm">{t('set_your_home')}</span>
                </button>
              )}
            </div>
          </>
        )}
        {recents.length > 0 && (
          <section data-testid="recent-trips" aria-labelledby="rt-h">
            <div class="sect">
              <h2 id="rt-h">{t('recent_trips')}</h2>
            </div>
            <ul class="rlist" data-testid="home-recent">
              {recents.slice(0, HOME_RECENTS).map((r, i) => (
                <li key={`${r.to.name}-${i}`} class="rrow">
                  <button type="button" class="ritem" data-testid={`recent-${i}`} onClick={() => go(r.to)}>
                    <span class="ic" aria-hidden="true">
                      <Icon name="clock" />
                    </span>
                    <span class="tx">
                      <b>{t('recent_to', { p: r.to.name })}</b>
                      <span>{t('recent_from', { p: r.from?.name ?? t('my_location'), d: relDate(r.date, Date.now(), toLang(s.lang)) })}</span>
                    </span>
                    <Icon name="chev" />
                  </button>
                  <button
                    type="button"
                    class="iconbtn sq"
                    data-testid={`rtrip-remove-${i}`}
                    aria-label={`${t('recent_remove')} ${r.to.name}`}
                    onClick={() => (store.recents.value = store.recents.value.filter((_, k) => k !== i))}
                  >
                    <Icon name="trash" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <HelpNote />
        {flags.has('help') && (
        <button type="button" class="helprow" data-testid="nav-help" onClick={() => router.openSheet('help')}>
          <span class="ic" aria-hidden="true">
            <Icon name="help" />
          </span>
          <span>
            <b>{t('help_row_t')}</b>
            <span>{family.contacts.value[0] ? t('hr_s_fam', { fam: family.contacts.value[0].name }) : t('hr_s_none')}</span>
          </span>
        </button>
        )}
      </main>
      <div class="dock">
        {home ? (
          <button type="button" class="btn btn-primary" data-testid="take-me-home" onClick={takeMeHome}>
            <Icon name="home" />
            {t('take_me_home')}
          </button>
        ) : (
          <button type="button" class="btn btn-primary" data-testid="set-your-home" onClick={() => router.navigate('/search?mode=home')}>
            <Icon name="home" />
            {t('set_your_home')}
          </button>
        )}
      </div>
    </>
  );
}
