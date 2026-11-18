/**
 * G2 multi-stop builder (STYLE-GUIDE §6c.3): up to 5 places after the start, ↑/↓ reorder,
 * remove, dwell picker; "See the way" plans the journey (runtime.planTrip) → H4 journey.
 */
import { useState } from "preact/hooks";
import { MAX_JOURNEY_STOPS, type Place } from "@howtogo/shared";
import { useServices, useT } from "../context";
import { here } from "../state/location";
import { announce, Bar, Icon, useStateHook } from "../ui/kit";
import { dwellLabel, useTick } from "./viewUtil";
export { addStop } from "./viewUtil";

/** Pure list edits (unit-tested). */
export function moveStop(stops: Place[], i: number, d: -1 | 1): Place[] {
  const j = i + d;
  if (j < 0 || j >= stops.length) return stops;
  const next = stops.slice();
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}
export function removeStop(stops: Place[], i: number): Place[] {
  return stops.length <= 1 ? stops : stops.filter((_, k) => k !== i);
}
export function JourneyBuilder() {
  const { store, router, runtime } = useServices();
  const t = useT();
  const tick = useTick();
  const plan = store.plan.value;
  const stops = plan.stops ?? (plan.to ? [plan.to] : []);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useStateHook(`journey-${stops.length}`);
  const from =
    plan.start ??
    plan.from ??
    (here.value
      ? {
          name: here.value.label ?? t("my_location"),
          lat: here.value.lat,
          lng: here.value.lng,
        }
      : null);
  const set = (next: Place[]) =>
    store.setPlan({ stops: next, journey: undefined });
  const focusRow = (i: number, sel: string) =>
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(`[data-testid="${sel}-${i}"]`)
        ?.focus(),
    );

  const see = async () => {
    if (!from || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const journey = await runtime.planTrip([
        { ...from, name: from.name || t("my_location") },
        ...stops,
      ]);
      store.setPlan({ journey });
      router.navigate("/trip?j=1");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Bar />
      <main class="scroll" data-testid="journey-builder">
        <h1 class="t-title" style={{ margin: 0 }}>
          {t("jb_title")}
        </h1>
        <p class="sbody" style={{ margin: "var(--s-2) 0 0" }}>
          {t("jb_lead")}
        </p>
        <ol class="stoplist">
          <li class="origin" data-testid="stop-origin">
            {t("jb_from", { p: from?.name || t("my_location") })}
          </li>
          {stops.map((p, i) => {
            const last = i === stops.length - 1;
            return (
              <li data-testid={`stop-${i}`}>
                <div class="head">
                  <span class="num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div class="nm" tabIndex={-1} data-testid={`stop-name-${i}`}>
                    <b>{p.name}</b>
                    {p.address && <span>{p.address}</span>}
                  </div>
                </div>
                <div class="ctl">
                  {last ? (
                    <span
                      class="t-caption"
                      style={{ flex: "1 1 5rem", color: "var(--c-ink-2)" }}
                    >
                      {t("jb_last")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      class="dwell"
                      data-testid={`stop-dwell-${i}`}
                      aria-label={t("jb_dwell_sr", {
                        p: p.name,
                        d: dwellLabel(p.dwellMin ?? 30, t),
                      })}
                      onClick={() => router.openSheet("dwell", { i })}
                    >
                      <Icon name="clock" />
                      {t("jb_stay", { d: dwellLabel(p.dwellMin ?? 30, t) })}
                    </button>
                  )}
                  <span class="mv">
                    <button
                      type="button"
                      class="iconbtn"
                      data-testid={`stop-up-${i}`}
                      aria-label={t("jb_up_sr", { p: p.name })}
                      aria-disabled={i === 0}
                      onClick={() => {
                        if (i === 0) return;
                        tick();
                        set(moveStop(stops, i, -1));
                        announce(t("jb_moved", { p: p.name, n: i }));
                        focusRow(i - 1, "stop-up");
                      }}
                    >
                      <Icon name="arrow-up" />
                    </button>
                    <button
                      type="button"
                      class="iconbtn"
                      data-testid={`stop-down-${i}`}
                      aria-label={t("jb_down_sr", { p: p.name })}
                      aria-disabled={last}
                      onClick={() => {
                        if (last) return;
                        tick();
                        set(moveStop(stops, i, 1));
                        announce(t("jb_moved", { p: p.name, n: i + 2 }));
                        focusRow(i + 1, "stop-down");
                      }}
                    >
                      <Icon name="arrow-down" />
                    </button>
                    {stops.length > 1 && (
                      <button
                        type="button"
                        class="iconbtn"
                        data-testid={`stop-remove-${i}`}
                        aria-label={t("jb_rm_sr", { p: p.name })}
                        onClick={() => {
                          tick();
                          set(removeStop(stops, i));
                          announce(t("jb_removed", { p: p.name }));
                          focusRow(Math.min(i, stops.length - 2), "stop-name");
                        }}
                      >
                        <Icon name="close" />
                      </button>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
        {stops.length < MAX_JOURNEY_STOPS ? (
          <button
            type="button"
            class="addrow"
            data-testid="stop-add"
            onClick={() => router.navigate("/search?mode=add")}
          >
            <Icon name="plus" />
            {t("add_stop")}
          </button>
        ) : (
          <p
            class="t-caption"
            style={{ color: "var(--c-ink-2)", marginTop: "var(--s-3)" }}
            data-testid="stop-max"
          >
            {t("jb_max")}
          </p>
        )}
        {failed && (
          <p
            class="t-headline"
            role="status"
            style={{ marginTop: "var(--s-4)" }}
          >
            {t("no_route")}
          </p>
        )}
      </main>
      <div class="dock">
        <button
          type="button"
          class="btn btn-primary"
          data-testid="journey-see"
          aria-busy={busy}
          disabled={!from || stops.length === 0 || busy}
          onClick={see}
        >
          {busy ? (
            <span class="spinner" aria-hidden="true" />
          ) : (
            <Icon name="route" />
          )}
          {t("jb_see")}
        </button>
      </div>
    </>
  );
}
