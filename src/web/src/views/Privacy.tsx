/**
 * 6f.1 L1 Privacy page `/privacy` (M5 AC 22, 23, 40). A real route: deep-linkable, works offline from the
 * shell cache. `lang` follows the app setting; from the family page (V) or the setup page (W) it follows
 * that page's language (`?lang=zh|en`). Everything is visible (no accordions); one h1, five h2.
 */
import { useEffect } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useServices } from '../context';
import { tf } from '../i18n/ui';
import { PRIVACY_NOTICE, PV_EN, PV_ZH, type PvKey } from '../i18n/privacy';
import { dataDate } from '../transit/m3';
import { Bar, Icon, type IconName } from '../ui/kit';
import { APP_VERSION } from '../version';

/** `**x**` → <strong>, `[x]` → a link-styled button (`onLink`). */
export function rich(text: string, onLink?: () => void, testid?: string): ComponentChildren[] {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\])/).map((part) => {
    if (part.startsWith('**')) return <strong>{part.slice(2, -2)}</strong>;
    if (part.startsWith('[') && onLink)
      return (
        <button type="button" class="inlink btnlink" data-testid={testid} onClick={onLink}>
          <span class="u">{part.slice(1, -1)}</span>
        </button>
      );
    if (part.startsWith('[')) return <strong>{part.slice(1, -1)}</strong>;
    return part;
  });
}

const GLANCE: [IconName, PvKey][] = [
  ['lock', 'pv_g1'],
  ['check', 'pv_g2'],
  ['home', 'pv_g3'],
];

export function Privacy() {
  const { store, router } = useServices();
  const q = router.route.value.query;
  const qLang = q.get('lang');
  const external = qLang === 'zh' || qLang === 'en';
  const lang = external ? (qLang as 'zh' | 'en') : store.settings.value.lang;
  const table = lang === 'en' ? PV_EN : PV_ZH;
  const t = (k: PvKey, p: Record<string, string | number> = {}) => table[k].replace(/\{(\w+)\}/g, (m, x: string) => (x in p ? String(p[x]) : m));
  const back = tf(lang, 'back');
  const inApp = router.depth.value > 0;
  useEffect(() => {
    if (q.get('s') === 'sent') {
      const h = document.getElementById('pv-h2');
      h?.scrollIntoView({ block: 'start' });
      h?.focus({ preventScroll: true });
    }
  }, []);
  /** From V/W (no app state) Settings opens first, then the sheet; in the app the sheet opens here. */
  const viaSettings = (sheet: string) => () => {
    if (external || !inApp) router.navigate('/settings');
    router.openSheet(sheet);
  };
  const list = (keys: PvKey[], last?: { key: PvKey; sheet: string; testid: string }) => (
    <ul class="dots" role="list">
      {keys.map((k) => (
        <li>{last && k === last.key ? rich(t(k), viaSettings(last.sheet), last.testid) : rich(t(k))}</li>
      ))}
    </ul>
  );
  return (
    <>
      {inApp ? (
        <Bar />
      ) : (
        <header class="bar">
          {/* From V/W (`?lang=`, same tab) Back returns there; opened on its own: a quiet link to the app. */}
          {external && history.length > 1 ? (
            <button type="button" class="backbtn" data-testid="back" aria-label={back} onClick={() => history.back()}>
              <Icon name="back" />
              <span>{back}</span>
            </button>
          ) : (
            <a class="inlink" href="/" data-testid="pv-open" onClick={(e) => (e.preventDefault(), router.navigate('/', { replace: true }))}>
              <span class="u">{t('pv_open')}</span>
            </a>
          )}
          <span class="grow" />
        </header>
      )}
      <main class="scroll" lang={lang === 'en' ? 'en' : 'zh-CN'} data-testid="privacy-page">
        <div class="pv">
          <h1 class="t-title" style={{ margin: '0 0 var(--s-3)' }}>
            {t('pv_title')}
          </h1>
          <p class="lead t-body">{t('pv_lead')}</p>
          <ul class="glance" role="list" aria-label={t('pv_glance')} data-testid="pv-glance">
            {GLANCE.map(([icon, k]) => (
              <li>
                <span class="disc" aria-hidden="true">
                  <Icon name={icon} />
                </span>
                <span class="t-label">{t(k)}</span>
              </li>
            ))}
          </ul>
          <h2 class="t-headline">{t('pv_h1')}</h2>
          {list(['pv_1a', 'pv_1b', 'pv_1c'])}
          <h2 class="t-headline" id="pv-h2" tabIndex={-1}>
            {t('pv_h2')}
          </h2>
          {list(['pv_2a', 'pv_2b', 'pv_2c', 'pv_2d', 'pv_2e'])}
          <h2 class="t-headline">{t('pv_h3')}</h2>
          {list(['pv_3a', 'pv_3b', 'pv_3c', 'pv_3d'])}
          <h2 class="t-headline">{t('pv_h4')}</h2>
          {list(['pv_4a'])}
          <h2 class="t-headline">{t('pv_h5')}</h2>
          {list(['pv_5a', 'pv_5b'], { key: 'pv_5a', sheet: 'delete-all', testid: 'pv-delete' })}
          <p class="t-caption famline">{t('pv_family')}</p>
          {/* AC 23: until the owner supplies a contact, questions go to Report a problem. */}
          <p class="pvcontact" data-testid="pv-contact">
            {rich(t('pv_contact'), viaSettings('report'), 'pv-report')}
          </p>
          <p class="t-caption pvfoot" data-testid="pv-footer">
            {t('pv_footer', { n: PRIVACY_NOTICE.n, date: dataDate(PRIVACY_NOTICE.date, lang), v: APP_VERSION })}
          </p>
        </div>
      </main>
    </>
  );
}
