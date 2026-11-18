/**
 * M4 screens: P3 family list, P4 add/edit (6e.4); P5 caregiver setup — senior side (send the
 * family page link / paste the link back), W family-side page `/setup`, and the senior's import
 * `/s/:code#k=` with preview, one "Yes" and a 10 s undo (6e.5, M4 AC 40–45, OQ2).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Place } from '@howtogo/shared';
import { Header } from '../app';
import { useServices, useT } from '../context';
import type { UiKey } from '../i18n/ui';
import { log } from '../log';
import { ApiError, failKind, type FailKind } from '../api/errors';
import type { SearchResult } from '../api/types';
import { family, formatPhone, MAX_CONTACTS, normalizePhone, RELATIONS, type Contact, type Relation } from '../state/family';
import { TEXT_SIZES, type TextSize } from '../state/store';
import { announce, Icon, Sheet, showToast, Wordmark } from '../ui/kit';
import { applySetup, openSetup, parseSetupLink, replaces, sealSetup, undoSetup, type SetupData, type Snapshot } from '../setup/setup';
import { openExternal } from './shareUtil';

// ---------------------------------------------------------------- P3
export function FamilyList() {
  const { router } = useServices();
  const t = useT();
  const list = family.contacts.value;
  return (
    <main class="scroll" data-testid="contacts">
      <Header title={t('fam_title')} />
      <div class="pane">
        <p class="t-body">{t('fam_lead')}</p>
        {list.map((c, i) => (
          <div class="contact" data-testid={`contact-${i}`}>
            <span class="av" aria-hidden="true">
              {[...c.name][0]}
            </span>
            <span class="tx">
              <b>{c.name}</b>
              <span class="num">
                {t(`rel_${c.relation}` as UiKey)} · {formatPhone(c.phone)}
              </span>
              {i === 0 && <span class="first">{t('fam_first')}</span>}
            </span>
            <button type="button" class="roundbtn jade" data-testid={`contact-call-${i}`} aria-label={t('fam_call_sr', { name: c.name })} onClick={() => openExternal(`tel:${c.phone}`)}>
              <Icon name="phone" />
            </button>
            <button type="button" class="roundbtn" data-testid={`contact-edit-${i}`} aria-label={t('fam_edit_sr', { name: c.name })} onClick={() => router.navigate(`/family/edit?i=${i}`)}>
              <Icon name="edit" />
            </button>
          </div>
        ))}
        {list.length < MAX_CONTACTS ? (
          <button type="button" class="btn btn-secondary dashed" data-testid="contact-add" onClick={() => router.navigate('/family/edit')}>
            <Icon name="plus" />
            {t('fam_add')}
          </button>
        ) : (
          <p class="t-caption">{t('fam_max')}</p>
        )}
        <button type="button" class="btn btn-quiet" data-testid="family-setup" onClick={() => router.navigate('/setup/start')}>
          <Icon name="family" />
          {t('fam_setup')}
        </button>
        <p class="t-caption" style={{ display: 'flex', gap: '8px' }}>
          <Icon name="lock" />
          {t('fam_lock')}
        </p>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------- errors
/** QA-45 (M4 AC 44/47): 429 → "请稍后再试", offline → "需要网络", anything else → the generic line. */
const FAIL_COPY: Record<FailKind, UiKey> = { rate: 'err_rate', offline: 'su_offline', other: 'w_failed' };

// ---------------------------------------------------------------- P4
/** QA-42: arrow-key choice for a radiogroup (WAI-ARIA radio group pattern; wraps). null = not an arrow key. */
export function radioStep<T>(list: readonly T[], cur: T | null, key: string): T | null {
  const d = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 0;
  if (!d || !list.length) return null;
  const i = cur === null ? -1 : list.indexOf(cur);
  if (i < 0) return list[d > 0 ? 0 : list.length - 1]!;
  return list[(i + d + list.length) % list.length]!;
}
type FieldErr = { name?: string; phone?: string };

export function ContactFields({ value, onChange, err }: { value: Partial<Contact> & { phoneRaw?: string }; onChange: (v: Partial<Contact> & { phoneRaw?: string }) => void; err: FieldErr }) {
  const t = useT();
  const v = value;
  return (
    <>
      <div class={`field2${err.name ? ' bad' : ''}`}>
        <label for="c-name">{t('fam_name')}</label>
        <input id="c-name" data-testid="contact-name" value={v.name ?? ''} placeholder={t('fam_name_ph')} maxLength={40} onInput={(e) => onChange({ ...v, name: e.currentTarget.value })} />
        {err.name && (
          <span class="fnote">
            <Icon name="info" />
            {err.name}
          </span>
        )}
      </div>
      <div class="field2">
        <span class="lb" id="c-rel">
          {t('fam_rel')}
        </span>
        {/* QA-42: a real radiogroup — aria-checked only (no aria-pressed), one tab stop, arrow keys move the choice. */}
        <div class="chips" role="radiogroup" aria-labelledby="c-rel" onKeyDown={(e) => {
          const next = radioStep(RELATIONS, v.relation ?? null, e.key);
          if (!next) return;
          e.preventDefault();
          onChange({ ...v, relation: next });
          (e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-testid="rel-${next}"]`)?.focus();
        }}>
          {RELATIONS.map((r, i) => {
            const on = v.relation === r;
            return (
              <button type="button" role="radio" aria-checked={on} tabIndex={on || (!v.relation && i === 0) ? 0 : -1} data-testid={`rel-${r}`} onClick={() => onChange({ ...v, relation: r as Relation })}>
                {t(`rel_${r}` as UiKey)}
              </button>
            );
          })}
        </div>
      </div>
      <div class={`field2${err.phone ? ' bad' : ''}`}>
        <label for="c-phone">{t('fam_phone')}</label>
        <div class="telrow">
          <span class="pre" aria-hidden="true">
            +65
          </span>
          <input id="c-phone" type="tel" inputMode="tel" data-testid="contact-phone" value={v.phoneRaw ?? ''} onInput={(e) => onChange({ ...v, phoneRaw: e.currentTarget.value })} />
        </div>
        {err.phone && (
          <span class="fnote">
            <Icon name="info" />
            {err.phone}
          </span>
        )}
      </div>
      <div class="field2">
        <label for="c-callme">{t('fam_callme')}</label>
        <input id="c-callme" data-testid="contact-callme" value={v.callMe ?? ''} placeholder={t('fam_callme_ph')} maxLength={40} onInput={(e) => onChange({ ...v, callMe: e.currentTarget.value })} />
        <span class="help">{t('fam_callme_h')}</span>
      </div>
      <div class="field2">
        <span class="lb">{t('fam_msglang')}</span>
        <div class="seg" role="group">
          {(['zh', 'en'] as const).map((l) => (
            <button type="button" aria-pressed={(v.lang ?? 'zh') === l} data-testid={`contact-lang-${l}`} onClick={() => onChange({ ...v, lang: l })}>
              {l === 'zh' ? '中文' : 'English'}
              {(v.lang ?? 'zh') === l && <Icon name="check" />}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/** Validates on Save only (6e.4); calm notes, focus to the first bad field. */
export function validateContact(v: Partial<Contact> & { phoneRaw?: string }, t: (k: UiKey) => string): { c?: Contact; err: FieldErr } {
  const err: FieldErr = {};
  if (!v.name?.trim()) err.name = t('fam_err_name');
  const p = normalizePhone(v.phoneRaw ?? '');
  if (!p.e164) err.phone = t(p.error === 'short' ? 'fam_err_short' : 'fam_err_fmt');
  if (err.name || err.phone) return { err };
  return { c: { name: v.name!.trim(), relation: v.relation ?? 'other', phone: p.e164!, ...(v.callMe?.trim() ? { callMe: v.callMe.trim() } : {}), lang: v.lang ?? 'zh' }, err };
}

export function FamilyEdit() {
  const { router } = useServices();
  const t = useT();
  const q = router.route.value.query.get('i');
  const idx = q === null ? -1 : Number(q);
  const orig = idx >= 0 ? family.contacts.value[idx] : undefined;
  const [v, setV] = useState<Partial<Contact> & { phoneRaw?: string }>(orig ? { ...orig, phoneRaw: orig.phone.replace(/^\+65/, '') } : { relation: 'daughter', lang: 'zh' });
  const [err, setErr] = useState<FieldErr>({});
  const [confirm, setConfirm] = useState(false);
  const save = () => {
    const r = validateContact(v, t);
    setErr(r.err);
    if (!r.c) {
      announce(r.err.name ?? r.err.phone ?? '');
      document.getElementById(r.err.name ? 'c-name' : 'c-phone')?.focus();
      return;
    }
    family.save(r.c, idx >= 0 ? idx : undefined);
    showToast('saved', t('fam_saved'));
    router.back();
  };
  return (
    <main class="scroll" data-testid="contact-edit">
      <Header title={orig ? t('fam_edit_t', { name: orig.name }) : t('fam_add_t')} />
      <div class="pane">
        <ContactFields value={v} onChange={setV} err={err} />
        <div class="stack">
          <button type="button" class="btn btn-primary btn-hero" data-testid="contact-save" onClick={save}>
            <Icon name="check" />
            {t('fam_save')}
          </button>
          {orig && idx > 0 && (
            <button
              type="button"
              class="btn btn-secondary"
              data-testid="contact-first"
              onClick={() => {
                family.makeFirst(idx);
                showToast('saved', t('fam_saved'));
                router.back();
              }}
            >
              {t('fam_makefirst')}
            </button>
          )}
          {orig && (
            <button type="button" class="btn btn-quiet" data-testid="contact-remove" onClick={() => setConfirm(true)}>
              <Icon name="trash" />
              {t('fam_remove', { name: orig.name })}
            </button>
          )}
        </div>
      </div>
      {confirm && orig && (
        <div class="sheetwrap">
          <div class="scrim" aria-hidden="true" onClick={() => setConfirm(false)} />
          <section class="sheet" role="dialog" aria-modal="true" aria-label={t('fam_remove_t', { name: orig.name })} data-testid="sheet-remove">
            <div class="sheethead">
              <h2>{t('fam_remove_t', { name: orig.name })}</h2>
            </div>
            <div class="stack">
              <button
                type="button"
                class="btn btn-secondary"
                data-testid="contact-remove-go"
                onClick={() => {
                  family.remove(idx);
                  showToast('removed', t('fam_removed'));
                  router.back();
                }}
              >
                {t('fam_remove_go')}
              </button>
              <button type="button" class="btn btn-primary" data-testid="contact-keep" onClick={() => setConfirm(false)}>
                {t('fam_keep')}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

// ---------------------------------------------------------------- P5 senior side
/** Senior: send the family page link; paste the link that comes back (needed on iOS, AC 42). */
export function SetupStart() {
  const { router } = useServices();
  const t = useT();
  const [link, setLink] = useState('');
  const [bad, setBad] = useState(false);
  const url = new URL('/setup', location.origin).toString();
  return (
    <main class="scroll" data-testid="setup-start">
      <Header title={t('su_t')} />
      <div class="pane">
        <p class="t-body">{t('su_lead')}</p>
        <div class="stack">
          <button type="button" class="btn btn-jade btn-hero" data-testid="setup-send-wa" onClick={() => openExternal(`https://wa.me/?text=${encodeURIComponent(`${t('w_title')} ${url}`)}`)}>
            <Icon name="msg" />
            {t('su_send_wa')}
          </button>
          <button type="button" class="btn btn-quiet" data-testid="setup-copy" onClick={() => void navigator.clipboard?.writeText(url).then(() => showToast('copied', t('sh_copied'))).catch(() => {})}>
            <Icon name="copy" />
            {t('sh_copy')}
          </button>
        </div>
        <div class={`field2${bad ? ' bad' : ''}`} style={{ marginTop: '24px' }}>
          <label for="su-link">{t('su_paste')}</label>
          <input id="su-link" data-testid="setup-paste" value={link} onInput={(e) => setLink(e.currentTarget.value)} />
          {bad && (
            <span class="fnote">
              <Icon name="info" />
              {t('su_broken')}
            </span>
          )}
        </div>
        <button
          type="button"
          class="btn btn-primary"
          data-testid="setup-paste-go"
          onClick={() => {
            const p = parseSetupLink(link);
            if (!p) return setBad(true);
            router.navigate(`/s/${p.code}#k=${p.key}`, { replace: true });
          }}
        >
          {t('su_paste_go')}
        </button>
      </div>
    </main>
  );
}

type ImportState = { k: 'loading' } | { k: 'error'; msg: UiKey } | { k: 'review'; data: SetupData };

/** `/s/:code#k=` → fetch once (consumes the box) → decrypt → P5b review → Yes (10 s undo) / No. */
export function SetupImport({ code }: { code: string }) {
  const { api, router, store, platform, runtime } = useServices();
  const t = useT();
  const [st, setSt] = useState<ImportState>({ k: 'loading' });
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const g = globalThis as { __setupKey?: string };
    const key = /#k=([A-Za-z0-9_-]+)/.exec(location.hash)?.[1] ?? g.__setupKey ?? '';
    delete g.__setupKey;
    // The key leaves the address bar at once (it never goes to the server anyway).
    history.replaceState(history.state, '', location.pathname);
    if (!key) return setSt({ k: 'error', msg: 'su_broken' });
    api
      .setupGet(code)
      .then((box) => openSetup(box.ct, key).catch(() => Promise.reject(new Error('decrypt'))))
      .then((data) => {
        setSt({ k: 'review', data });
        log('state:setup-review');
        void platform.vibrate('attention');
        const title = data.from ? t('su_review_t', { fam: data.from }) : t('su_review_t_any');
        announce(title);
      })
      .catch((e: unknown) => {
        const msg: UiKey =
          e instanceof ApiError
            ? e.kind === 'offline' || e.kind === 'network' ? 'su_offline' : e.code === 'setup_used' ? 'su_used' : e.code === 'setup_expired' ? 'su_expired' : 'su_broken'
            : 'su_broken';
        log(`state:setup-${msg}`);
        setSt({ k: 'error', msg });
      });
  }, []);
  void runtime;
  if (st.k === 'loading')
    return (
      <main class="scroll" data-testid="setup-import" aria-busy="true">
        <Header title={t('su_review_t_any')} />
        <p class="note">{t('loading')}</p>
      </main>
    );
  if (st.k === 'error')
    return (
      <main class="scroll" data-testid="setup-import">
        <Header title={t('su_review_t_any')} />
        <div class="pane">
          <p class="t-headline" role="alert" data-testid="setup-error" data-msg={st.msg}>
            {t(st.msg)}
          </p>
          <button type="button" class="btn btn-primary" data-testid="setup-error-ok" onClick={() => router.navigate('/', { replace: true })}>
            {t('app_name')}
          </button>
        </div>
      </main>
    );
  const d = st.data;
  const rep = replaces(d, store.places.value, family.contacts.value);
  const title = d.from ? t('su_review_t', { fam: d.from }) : t('su_review_t_any');
  const yes = () => {
    const snap: Snapshot = applySetup(d, store, family);
    void platform.vibrate('confirm');
    log('setup:applied');
    showUndo(snap);
    router.navigate('/', { replace: true });
  };
  const showUndo = (snap: Snapshot) => {
    undoSnap = snap;
    undoUntil = Date.now() + 10_000;
    setTimeout(() => {
      if (undoSnap === snap) undoSnap = null;
    }, 10_000);
    showToast('setup-done', t('su_done'), 10_000);
  };
  return (
    <main class="scroll" data-testid="setup-import">
      <Header title={title} />
      <div class="pane" data-testid="setup-review">
        {(d.home || d.places?.length) && (
          <section class="card">
            <h2 class="t-label">{t('su_places')}</h2>
            {d.home && (
              <p>
                <Icon name="home" /> <b>{t('w_home')}</b> · {d.home.name}
              </p>
            )}
            {rep.home && (
              <p class="replace" data-testid="setup-replace-home">
                <Icon name="info" />
                {t('su_replace_home')}
              </p>
            )}
            {d.places?.map((p) => (
              <p>
                <Icon name="clinic" /> <b>{p.label}</b> · {p.name}
              </p>
            ))}
            {rep.places > 0 && (
              <p class="replace">
                <Icon name="info" />
                {t('su_replace_n', { n: rep.places, what: t('su_places') })}
              </p>
            )}
          </section>
        )}
        {d.contacts?.length ? (
          <section class="card">
            <h2 class="t-label">{t('fam_title')}</h2>
            {d.contacts.map((c) => (
              <p class="num">
                <b>{c.name}</b> · {t(`rel_${c.relation}` as UiKey)} · {formatPhone(c.phone)}
              </p>
            ))}
            {rep.contacts > 0 && (
              <p class="replace" data-testid="setup-replace-contacts">
                <Icon name="info" />
                {t('su_replace_n', { n: rep.contacts, what: t('fam_title') })}
              </p>
            )}
          </section>
        ) : null}
        {d.name && (
          <section class="card">
            <h2 class="t-label">{t('su_greet')}</h2>
            <p>{t('su_greet_v', { name: d.name })}</p>
          </section>
        )}
        <p class="t-caption">{t('su_caption')}</p>
        <div class="stickybar stack">
          <button type="button" class="btn btn-primary btn-hero" data-testid="setup-yes" onClick={yes}>
            <Icon name="check" />
            {t('su_yes')}
          </button>
          <button
            type="button"
            class="btn btn-secondary"
            data-testid="setup-no"
            onClick={() => {
              showToast('setup-no', t('su_undone'));
              router.navigate('/', { replace: true });
            }}
          >
            {t('su_no')}
          </button>
        </div>
      </div>
    </main>
  );
}

let undoSnap: Snapshot | null = null;
let undoUntil = 0;
/** The 10 s undo on Home after applying a setup (OQ2). */
export function SetupUndo() {
  const { store } = useServices();
  const t = useT();
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (!undoSnap || Date.now() > undoUntil) return null;
  return (
    <p class="note" role="status" data-testid="setup-undo-bar">
      <Icon name="check" />
      <span>{t('su_done')}</span>
      <button
        type="button"
        class="btn btn-quiet"
        data-testid="setup-undo"
        onClick={() => {
          undoSetup(undoSnap!, store, family);
          undoSnap = null;
          log('setup:undone');
          showToast('setup-undone', t('su_undone'));
        }}
      >
        {t('su_undo')}
      </button>
    </p>
  );
}

// ---------------------------------------------------------------- W family-side page
interface WPlace extends Place {
  label: string;
}

function PlaceSearch({ id, onPick }: { id: string; onPick: (p: SearchResult) => void }) {
  const { api } = useServices();
  const t = useT();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<SearchResult[]>([]);
  return (
    <div class="field2">
      <label for={id}>{t('w_search')}</label>
      <input
        id={id}
        data-testid={id}
        value={q}
        placeholder={t('w_search_ph')}
        onInput={(e) => {
          const v = e.currentTarget.value;
          setQ(v);
          if (v.trim().length >= 2) api.search(v).then(setRes).catch(() => setRes([]));
          else setRes([]);
        }}
      />
      {res.slice(0, 4).map((r, i) => (
        <button
          type="button"
          class="ritem"
          data-testid={`${id}-r${i}`}
          onClick={() => {
            onPick(r);
            setQ('');
            setRes([]);
          }}
        >
          <span class="tx">
            <b>{r.name}</b>
            <span>{r.address}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** W header (review #10, §6e.5): logo + a 56 px English / 中文 toggle, since the family member may read English. */
function WHeader() {
  const { store } = useServices();
  const t = useT();
  const zh = store.settings.value.lang === 'zh';
  return (
    <>
      <header class="whead">
        <Wordmark name={t('app_name')} />
        <button
          type="button"
          class="iconbtn"
          data-testid="w-lang"
          lang={zh ? 'en' : 'zh-CN'}
          onClick={() => store.updateSettings({ lang: zh ? 'en' : 'zh' })}
        >
          {zh ? 'English' : '中文'}
        </button>
      </header>
      <h1 class="t-title" style={{ margin: '0 var(--s-5) var(--s-2)' }}>
        {t('w_title')}
      </h1>
    </>
  );
}

/** W: fill → encrypt in this browser → POST ciphertext → link `/s/<code>#k=<key>` to send back. */
export function SetupFamily() {
  const { api, store } = useServices();
  const t = useT();
  const [name, setName] = useState('');
  const [you, setYou] = useState('');
  const [home, setHome] = useState<Place | null>(null);
  const [places, setPlaces] = useState<WPlace[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [draft, setDraft] = useState<Partial<Contact> & { phoneRaw?: string }>({ relation: 'daughter', lang: 'zh' });
  const [err, setErr] = useState<{ name?: string; phone?: string }>({});
  const [selfPhone, setSelfPhone] = useState('');
  const [lang, setLang] = useState<'zh' | 'en'>(store.settings.value.lang);
  const [size, setSize] = useState<TextSize>('large');
  const [sent, setSent] = useState<string | null>(null);
  const [handed, setHanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<FailKind | null>(null);
  const toPlace = (r: SearchResult): Place => ({ name: r.name, lat: r.lat, lng: r.lng, address: r.address, postal: r.postal });
  const addContact = () => {
    const r = validateContact(draft, t);
    setErr(r.err);
    if (r.c) {
      setContacts([...contacts, r.c].slice(0, MAX_CONTACTS));
      setDraft({ relation: 'daughter', lang: 'zh' });
    }
  };
  const send = async () => {
    setBusy(true);
    setFail(null);
    try {
      const me = normalizePhone(selfPhone).e164;
      const data: SetupData = {
        v: 1,
        ...(you.trim() ? { from: you.trim() } : {}),
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(home ? { home } : {}),
        ...(places.length ? { places } : {}),
        ...(contacts.length ? { contacts } : {}),
        ...(me ? { myPhone: me } : {}),
        lang,
        textSize: size,
      };
      const { ct, key } = await sealSetup(data);
      const box = await api.setupCreate(ct);
      setSent(new URL(`/s/${box.code}#k=${key}`, location.origin).toString());
      log('setup:sent');
    } catch (e) {
      setFail(failKind(e));
    } finally {
      setBusy(false);
    }
  };
  if (sent)
    return (
      <main class="scroll" data-testid="setup-family">
        <WHeader />
        <div class="pane" data-testid="setup-sent">
          {/* Review #10: "Sent" only once the link has actually gone out (WhatsApp / copy). */}
          <p class="t-headline" role="status" data-testid="w-sent">
            {handed ? t('w_sent') : ''}
          </p>
          <p class="t-label">{t('w_link')}</p>
          <div class="stack">
            <button type="button" class="btn btn-jade btn-hero" data-testid="setup-link-wa" onClick={() => {
                setHanded(true);
                openExternal(`https://wa.me/?text=${encodeURIComponent(sent)}`);
              }}>
              <Icon name="msg" />
              {t('su_send_wa')}
            </button>
            <button type="button" class="btn btn-quiet" data-testid="setup-link-copy" onClick={() => {
                setHanded(true);
                void navigator.clipboard?.writeText(sent).catch(() => {});
              }}>
              <Icon name="copy" />
              {t('sh_copy')}
            </button>
          </div>
          <input class="sr" readOnly value={sent} data-testid="setup-link" aria-label={t('w_link')} />
        </div>
      </main>
    );
  return (
    <main class="scroll" data-testid="setup-family">
      <WHeader />
      <div class="pane">
        <p class="t-body" style={{ display: 'flex', gap: '8px' }}>
          <Icon name="lock" />
          {t('w_lead')}
        </p>
        <section class="card">
          <div class="field2">
            <label for="w-name">{t('w_name')}</label>
            <input id="w-name" data-testid="w-name" value={name} placeholder={t('w_name_ph')} maxLength={40} onInput={(e) => setName(e.currentTarget.value)} />
          </div>
        </section>
        <section class="card">
          <h2 class="wsec">{t('w_home')}</h2>
          {home && <p data-testid="w-home-picked">{home.name}</p>}
          <PlaceSearch id="w-home" onPick={(r) => setHome(toPlace(r))} />
        </section>
        <section class="card">
          <h2 class="wsec">{t('w_places')}</h2>
          {places.map((p) => (
            <p>{p.name}</p>
          ))}
          {places.length < 5 && <PlaceSearch id="w-place" onPick={(r) => setPlaces([...places, { ...toPlace(r), label: r.name }])} />}
        </section>
        <section class="card">
          <h2 class="wsec">{t('w_contacts')}</h2>
          {contacts.map((c) => (
            <p class="num" data-testid="w-contact">
              <b>{c.name}</b> · {formatPhone(c.phone)}
            </p>
          ))}
          <ContactFields value={draft} onChange={setDraft} err={err} />
          <button type="button" class="btn btn-secondary" data-testid="w-contact-add" onClick={addContact}>
            <Icon name="plus" />
            {t('fam_add')}
          </button>
        </section>
        <section class="card">
          <div class="field2">
            <label for="w-self">{t('w_phone_self')}</label>
            <input id="w-self" type="tel" data-testid="w-self" value={selfPhone} onInput={(e) => setSelfPhone(e.currentTarget.value)} />
          </div>
          <span class="lb">{t('su_langsize')}</span>
          <div class="seg" role="group">
            {(['zh', 'en'] as const).map((l) => (
              <button type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>
                {l === 'zh' ? '中文' : 'English'}
                {lang === l && <Icon name="check" />}
              </button>
            ))}
          </div>
          <div class="seg" role="group" style={{ marginTop: '8px' }}>
            {TEXT_SIZES.map((s, i) => (
              <button type="button" aria-pressed={size === s} onClick={() => setSize(s)}>
                {['100%', '125%', '150%', '200%'][i]}
                {size === s && <Icon name="check" />}
              </button>
            ))}
          </div>
        </section>
        <section class="card">
          <div class="field2">
            <label for="w-you">{t('w_you')}</label>
            <input id="w-you" data-testid="w-you" value={you} maxLength={40} onInput={(e) => setYou(e.currentTarget.value)} />
          </div>
        </section>
        {fail && (
          <p class="note" role="alert" data-testid="w-failed">
            {t(FAIL_COPY[fail])}
          </p>
        )}
        <button type="button" class="btn btn-primary btn-hero" data-testid="w-send" disabled={busy} aria-busy={busy} onClick={() => void send()}>
          <Icon name="check" />
          {t('w_send')}
        </button>
      </div>
    </main>
  );
}

/** Settings → 清除所有资料 (M4 AC 50): confirm, then remove everything this app stored on the phone. */
export function DeleteAllSheet() {
  const { router } = useServices();
  const t = useT();
  return (
    <Sheet id="delete-all" title={t('set_delete_all_t')}>
      <p class="t-body">{t('set_delete_all_b')}</p>
      <div class="stack">
        <button
          type="button"
          class="btn btn-secondary"
          data-testid="delete-all-go"
          onClick={() => {
            try {
              for (const k of Object.keys(localStorage)) if (k.startsWith('howtogo.')) localStorage.removeItem(k);
              sessionStorage.clear();
            } catch {
              /* ignore */
            }
            location.replace('/');
          }}
        >
          <Icon name="trash" />
          {t('set_delete_all')}
        </button>
        <button type="button" class="btn btn-primary" data-testid="delete-all-keep" onClick={() => router.closeSheet()}>
          {t('fam_keep')}
        </button>
      </div>
    </Sheet>
  );
}
