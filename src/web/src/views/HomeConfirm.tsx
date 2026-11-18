/** F1 page 3 / F6 confirm card for a Home picked in set-home mode. Confirm → saved + toast "设好了！". */
import { useServices, useT } from '../context';
import { Icon, showToast } from '../ui/kit';
import { pendingHome } from '../state/pendingHome';

export function HomeConfirm({ onDone }: { onDone?: () => void }) {
  const { store, router } = useServices();
  const t = useT();
  const p = pendingHome.value;
  if (!p) return null;
  return (
    <div class="confirm" data-testid="home-confirm" style={{ marginBottom: 'var(--s-4)' }}>
      <span class="ic" aria-hidden="true">
        <Icon name="home" />
      </span>
      <b class="t-headline">{t('home_label', { p: p.name })}</b>
      <button
        type="button"
        class="btn btn-primary"
        data-testid="home-yes"
        onClick={() => {
          store.setHome(p);
          pendingHome.value = null;
          if (onDone) onDone();
          else showToast('home-set', t('toast_home_set'));
        }}
      >
        {t('home_yes')}
      </button>
      <button
        type="button"
        class="btn btn-secondary"
        style={{ minHeight: 'var(--tap)', fontSize: '1rem' }}
        data-testid="home-no"
        onClick={() => {
          pendingHome.value = null;
          router.navigate('/search?mode=home');
        }}
      >
        {t('home_no')}
      </button>
    </div>
  );
}
