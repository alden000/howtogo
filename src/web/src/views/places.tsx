/**
 * QA-40 (M4 AC 39): Settings → 常去的地方 / My places. Up to 6 places (5.1 tiles), Home always first.
 * Add (search, `/search?mode=place`), rename, remove (with a confirm, like P4), ↑↓ (no drag, like G2).
 * Built from existing parts: the G2 stop list rows (6c.3), the P3 dashed add row, the P4 remove confirm.
 */
import { useState } from 'preact/hooks';
import { useServices, useT } from '../context';
import { log } from '../log';
import { canAdd, LABEL_MAX, movePlace, placeKind, removePlace, renamePlace, type PlaceKind } from '../state/places';
import { announce, Bar, Icon, Sheet, showToast, type IconName } from '../ui/kit';
import { useTick } from './Guide';
import { HomeConfirm } from './HomeConfirm';

const KIND_ICON: Record<PlaceKind | 'home', IconName> = { home: 'home', clinic: 'clinic', market: 'market', daughter: 'family', other: 'loc' };

export function PlacesScreen() {
  const { store, router } = useServices();
  const t = useT();
  const tick = useTick();
  const saved = store.places.value;
  const home = saved.home;
  const others = saved.others;
  const focus = (sel: string) => requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-testid="${sel}"]`)?.focus());
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= others.length) return;
    tick();
    store.places.value = movePlace(store.places.peek(), i, d);
    // Positions count Home as place 1.
    announce(t('jb_moved', { p: others[i]!.label, n: j + 1 + (home ? 1 : 0) }));
    focus(`place-${d < 0 ? 'up' : 'down'}-${j}`);
  };
  return (
    <>
      <Bar />
      <main class="scroll" data-testid="places">
        <h1 class="t-title" style={{ margin: 0 }}>
          {t('my_places')}
        </h1>
        <p class="sbody" style={{ margin: 'var(--s-2) 0 0' }}>
          {t('pl_lead')}
        </p>
        <HomeConfirm />
        <ol class="stoplist placelist">
          {home ? (
            <li data-testid="place-home">
              <div class="head">
                <span class="num" data-k="home" aria-hidden="true">
                  <Icon name="home" />
                </span>
                <div class="nm">
                  <b>{t('home_tile')}</b>
                  <span>{home.name}</span>
                </div>
                <button type="button" class="iconbtn" data-testid="place-home-edit" aria-label={t('pl_change_home_sr')} onClick={() => router.openSheet('home')}>
                  <Icon name="edit" />
                </button>
              </div>
            </li>
          ) : (
            <li class="origin">
              <button type="button" class="btn btn-secondary small" data-testid="place-home-set" onClick={() => router.navigate('/search?mode=home')}>
                <Icon name="home" />
                {t('set_your_home')}
              </button>
            </li>
          )}
          {others.map((p, i) => {
            const k = placeKind(p.label);
            const last = i === others.length - 1;
            return (
              <li data-testid={`place-${i}`}>
                <div class="head">
                  <span class="num" data-k={k} aria-hidden="true">
                    <Icon name={KIND_ICON[k]} />
                  </span>
                  <div class="nm">
                    <b>{p.label}</b>
                    {p.label !== p.name && <span>{p.name}</span>}
                  </div>
                </div>
                <div class="ctl">
                  <button type="button" class="dwell" data-testid={`place-rename-${i}`} aria-label={t('pl_rename_sr', { p: p.label })} onClick={() => router.openSheet('place-rename', { i })}>
                    <Icon name="edit" />
                    {t('pl_rename')}
                  </button>
                  <span class="mv">
                    <button type="button" class="iconbtn" data-testid={`place-up-${i}`} aria-label={t('jb_up_sr', { p: p.label })} aria-disabled={i === 0} onClick={() => move(i, -1)}>
                      <Icon name="arrow-up" />
                    </button>
                    <button type="button" class="iconbtn" data-testid={`place-down-${i}`} aria-label={t('jb_down_sr', { p: p.label })} aria-disabled={last} onClick={() => move(i, 1)}>
                      <Icon name="arrow-down" />
                    </button>
                    <button type="button" class="iconbtn" data-testid={`place-remove-${i}`} aria-label={t('pl_remove_sr', { p: p.label })} onClick={() => router.openSheet('place-remove', { i })}>
                      <Icon name="trash" />
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
        {canAdd(saved) ? (
          <button type="button" class="addrow" data-testid="place-add" onClick={() => router.navigate('/search?mode=place')}>
            <Icon name="plus" />
            {t('add_place_title')}
          </button>
        ) : (
          <p class="t-caption" style={{ color: 'var(--c-ink-2)', marginTop: 'var(--s-3)' }} data-testid="place-max">
            {t('pl_max')}
          </p>
        )}
      </main>
    </>
  );
}

/** Rename one place (the tile name). Back = no change. */
export function PlaceRenameSheet() {
  const { store, router } = useServices();
  const t = useT();
  const i = ((router.sheetData.value ?? {}) as { i?: number }).i ?? -1;
  const p = store.places.value.others[i];
  const [v, setV] = useState(p?.label ?? '');
  if (!p) return null;
  const save = () => {
    if (!v.trim()) return;
    store.places.value = renamePlace(store.places.peek(), i, v);
    log('places:rename');
    router.closeSheet();
    showToast('place-saved', t('fam_saved'));
  };
  return (
    <Sheet id="place-rename" title={t('pl_rename')}>
      <div class="field2">
        <label for="place-name">{t('fam_name')}</label>
        <input id="place-name" data-testid="place-name" maxLength={LABEL_MAX} placeholder={t('pl_name_ph')} value={v} onInput={(e) => setV(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </div>
      <button type="button" class="btn btn-primary" data-testid="place-save" onClick={save}>
        <Icon name="check" />
        {t('fam_save')}
      </button>
    </Sheet>
  );
}

/** Remove confirm (as P4's): Remove is secondary, Keep is primary. */
export function PlaceRemoveSheet() {
  const { store, router } = useServices();
  const t = useT();
  const i = ((router.sheetData.value ?? {}) as { i?: number }).i ?? -1;
  const p = store.places.value.others[i];
  if (!p) return null;
  return (
    <Sheet id="place-remove" title={t('fam_remove_t', { name: p.label })}>
      <div class="stack">
        <button
          type="button"
          class="btn btn-secondary"
          data-testid="place-remove-go"
          onClick={() => {
            store.places.value = removePlace(store.places.peek(), i);
            log('places:remove');
            router.closeSheet();
            showToast('place-removed', t('fam_removed'));
          }}
        >
          <Icon name="trash" />
          {t('fam_remove_go')}
        </button>
        <button type="button" class="btn btn-primary" data-testid="place-remove-keep" onClick={() => router.closeSheet()}>
          {t('fam_keep')}
        </button>
      </div>
    </Sheet>
  );
}
