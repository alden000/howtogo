/**
 * 1.2 (QA-72/73) "哪一座？/ Which block?": a road or estate picked as Home or a My place has no block or
 * postal code, so drivers can't find it. Lists the addressable blocks near the point (Worker
 * `/api/revgeocode?blocks=1`) and takes a 6-digit postal code instead; "keep" saves the pick as it is.
 * Built from the existing confirm card (.confirm), result rows (.rlist/.ritem) and field (.field2).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { LatLng, Place } from '@howtogo/shared';
import type { SearchResult } from '../api/types';
import { useServices, useT } from '../context';
import { useT12 } from '../i18n/v12';
import { Icon, showToast } from '../ui/kit';
import { findPostal, homeNudge, pendingPlace, streetLine, withBlock } from '../state/address';
import { addPlace } from '../state/places';

export function BlockPicker(props: {
  center: LatLng;
  /** The picked place's name (for the "{p} has several blocks" line and the keep button); none = no keep button. */
  keepName?: string | undefined;
  /** Why-line shown under the title (defaults to blk_why with keepName). */
  intro?: boolean;
  onPick: (b: SearchResult) => void;
  onKeep?: (() => void) | undefined;
  testid?: string;
  /** Icon disc: Home `home` on tint-home (default); a My place `loc` on c-surface-2 (6i.1 / P8). */
  icon?: 'home' | 'loc';
}) {
  const { api } = useServices();
  const t = useT12();
  const [blocks, setBlocks] = useState<SearchResult[] | null>(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState<'' | 'bad' | 'none'>('');
  const [busy, setBusy] = useState(false);
  // F2: the picker replaces the card, so move focus to its title (the title is the announcement).
  const titleRef = useRef<HTMLElement>(null);
  useEffect(() => titleRef.current?.focus(), []);
  useEffect(() => {
    let live = true;
    setBlocks(null);
    const p = api.nearbyBlocks ? api.nearbyBlocks(props.center).catch(() => []) : Promise.resolve([]);
    void p.then((b) => live && setBlocks(b));
    return () => {
      live = false;
    };
  }, [props.center.lat, props.center.lng]);

  const usePostal = async () => {
    const c = code.replace(/\D/g, '');
    if (c.length !== 6) return setErr('bad');
    setBusy(true);
    const hit = await findPostal(api, c);
    setBusy(false);
    if (!hit) return setErr('none');
    props.onPick(hit);
  };
  const id = props.testid ?? 'block-pick';
  return (
    <div class="confirm" data-testid={id} style={{ marginBottom: 'var(--s-4)' }}>
      <span class="ic" aria-hidden="true" style={props.icon === 'loc' ? { background: 'var(--c-surface-2)', color: 'var(--c-ink)' } : undefined}>
        <Icon name={props.icon ?? 'home'} />
      </span>
      <b class="t-headline" tabIndex={-1} ref={titleRef}>
        {t('blk_title')}
      </b>
      {props.intro !== false && props.keepName && <p class="t-body" style={{ margin: 0 }}>{t('blk_why', { p: props.keepName })}</p>}
      {blocks === null ? (
        <p class="t-body" role="status" aria-busy="true" data-testid={`${id}-loading`} style={{ margin: 0 }}>
          {t('blk_loading')}
        </p>
      ) : blocks.length === 0 ? (
        <p class="t-body" role="status" data-testid={`${id}-none`} style={{ margin: 0 }}>
          {t('blk_none')}
        </p>
      ) : (
        <ul class="rlist">
          {blocks.slice(0, 6).map((b, i) => (
            <li key={`${b.name}-${b.postal}`}>
              <button type="button" class="ritem" data-testid={`${id}-${i}`} onClick={() => props.onPick(b)}>
                <span class="ic" aria-hidden="true">
                  <Icon name="loc" />
                </span>
                <span class="tx" lang="en">
                  <b>{streetLine(b.address) || b.name}</b>
                  <span class="num">Singapore {b.postal}</span>
                </span>
                <Icon name="chev" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div class={`field2${err ? ' bad' : ''}`} style={{ margin: 0 }}>
        <label for={`${id}-postal`}>{t(blocks && blocks.length === 0 ? 'blk_postal_only' : 'blk_postal')}</label>
        <input
          id={`${id}-postal`}
          data-testid={`${id}-postal`}
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          value={code}
          aria-invalid={err ? 'true' : undefined}
          aria-describedby={err ? `${id}-err` : undefined}
          onInput={(e) => {
            setCode(e.currentTarget.value.replace(/\D/g, '').slice(0, 6));
            setErr('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && void usePostal()}
        />
        {err && (
          <span class="fnote" role="alert" id={`${id}-err`} data-testid={`${id}-err`}>
            <Icon name="info" />
            {t(err === 'bad' ? 'blk_postal_bad' : 'blk_postal_none')}
          </span>
        )}
      </div>
      <button type="button" class="btn btn-primary" data-testid={`${id}-postal-go`} disabled={busy} onClick={() => void usePostal()}>
        {t('blk_postal_go')}
      </button>
      {props.onKeep && props.keepName && (
        <button type="button" class="btn btn-secondary" style={{ minHeight: 'var(--tap)', fontSize: '1rem' }} data-testid={`${id}-keep`} onClick={props.onKeep}>
          {t('blk_keep', { p: props.keepName })}
        </button>
      )}
    </div>
  );
}

/** My places: a road/estate picked with `/search?mode=place` → Which block? before it is saved. */
export function PlaceBlockAsk() {
  const { store } = useServices();
  const t = useT();
  const p = pendingPlace.value;
  if (!p) return null;
  const save = (place: Place, label = p.name) => {
    store.places.value = addPlace(store.places.peek(), place, label);
    pendingPlace.value = null;
    showToast('place-saved', t('fam_saved'));
  };
  return (
    <BlockPicker
      testid="place-block"
      icon="loc"
      center={p}
      keepName={p.name}
      onPick={(b) => save(withBlock(p, b))}
      onKeep={() => save(p)}
    />
  );
}

/** One-time Home nudge (QA-72, 6i.3): Home has no block/postal code. A standing offer, so no live role. */
export function HomeNudge({ onAdd }: { onAdd: () => void }) {
  const t = useT12();
  return (
    <div class="note nudge" data-testid="home-nudge">
      <Icon name="home" />
      <button
        type="button"
        class="btn-quiet"
        style={{ flex: '1 1 10em', textAlign: 'left', fontWeight: 700, minHeight: 'var(--tap)' }}
        data-testid="home-nudge-add"
        onClick={() => {
          homeNudge.done();
          onAdd();
        }}
      >
        {t('home_nudge')}
      </button>
      <button type="button" class="btn btn-quiet" data-testid="home-nudge-close" onClick={() => homeNudge.done()}>
        {t('home_nudge_close')}
      </button>
    </div>
  );
}
