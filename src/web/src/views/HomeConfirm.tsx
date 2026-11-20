/**
 * F1 page 3 / F6 confirm card for a Home picked in set-home mode. Confirm → saved + toast "设好了！".
 * 1.2 (QA-72/73): the card shows the full address and postal code; a road/estate without a postal code
 * asks "哪一座？/ Which block?" first; a Home from "use where I am now" offers "不对？换一个 / Not right?
 * Pick another" (nearby blocks or a postal code) instead of searching again.
 */
import { useState } from 'preact/hooks';
import { useServices, useT } from '../context';
import { Icon, showToast } from '../ui/kit';
import { homeToSave, pendingHome } from '../state/pendingHome';
import { hasPostal, postalOf, streetLine, withBlock } from '../state/address';
import { lazyView } from '../ui/lazy';

// Home entry budget (M5 AC 3): the picker is its own chunk, warmed when idle.
const BlockPicker = lazyView(() => import('./blockPick').then((m) => m.BlockPicker));

export function HomeConfirm({ onDone }: { onDone?: () => void }) {
  const { store, router } = useServices();
  const t = useT();
  const [picking, setPicking] = useState(false);
  const p = pendingHome.value;
  if (!p) return null;
  const save = () => {
    store.setHome(homeToSave(p));
    pendingHome.value = null;
    setPicking(false);
    if (onDone) onDone();
    else showToast('home-set', t('toast_home_set'));
  };
  if (picking || (!hasPostal(p) && !p.noBlockAsk)) {
    return (
      <BlockPicker
        testid="home-block"
        center={p}
        keepName={p.name}
        intro={!picking}
        onPick={(b) => {
          setPicking(false);
          pendingHome.value = { ...withBlock(p, b), ...(p.estate ? { name: p.estate } : {}) };
        }}
        onKeep={
          picking
            ? () => setPicking(false)
            : () => {
                pendingHome.value = { ...p, noBlockAsk: true };
              }
        }
      />
    );
  }
  const street = streetLine(p.address);
  const showStreet = !!street && street.toLowerCase() !== p.name.toLowerCase();
  const postal = postalOf(p);
  return (
    <div class="confirm" data-testid="home-confirm" style={{ marginBottom: 'var(--s-4)' }}>
      <span class="ic" aria-hidden="true">
        <Icon name="home" />
      </span>
      <b class="t-headline">{t('home_label', { p: p.name })}</b>
      {(showStreet || postal) && (
        <p class="t-body" lang="en" data-testid="home-confirm-addr" style={{ margin: 0 }}>
          {showStreet && (
            <>
              {street}
              <br />
            </>
          )}
          {postal && <span class="num">Singapore {postal}</span>}
        </p>
      )}
      <button type="button" class="btn btn-primary" data-testid="home-yes" onClick={save}>
        {t('home_yes')}
      </button>
      <button
        type="button"
        class="btn btn-secondary"
        style={{ minHeight: 'var(--tap)', fontSize: '1rem' }}
        data-testid="home-no"
        onClick={() => {
          if (p.fromHere) return setPicking(true);
          pendingHome.value = null;
          router.navigate('/search?mode=home');
        }}
      >
        {t(p.fromHere ? 'home_pick_other' : 'home_no')}
      </button>
    </div>
  );
}
