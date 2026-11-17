import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Api } from './api/types';
import type { Platform } from './platform/types';
import type { Router } from './router/router';
import type { Store } from './state/store';
import type { TripRuntime } from './trip/runtime';
import { tr, type UiKey } from './i18n/ui';

export interface Services {
  store: Store;
  router: Router;
  api: Api;
  platform: Platform;
  runtime: TripRuntime;
  mode: { demo: boolean; mock: boolean };
}

export const ServicesContext = createContext<Services | null>(null);

export function useServices(): Services {
  const s = useContext(ServicesContext);
  if (!s) throw new Error('ServicesContext missing');
  return s;
}

/** Translate with the current UI language (re-renders on change via the settings signal). */
export function useT(): (k: UiKey) => string {
  const { store } = useServices();
  const lang = store.settings.value.lang;
  return (k) => tr(lang, k);
}
