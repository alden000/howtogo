/** Route table and pure matching. Path routing; Cloudflare Pages serves index.html for unknown paths (public/_redirects). */
export type RouteName =
  | 'home'
  | 'search'
  | 'routes'
  | 'trip'
  | 'journey'
  | 'guide'
  | 'share_start'
  | 'viewer'
  | 'help'
  | 'settings'
  | 'about'
  | 'welcome'
  | 'family'
  | 'family_edit'
  | 'setup_start'
  | 'setup'
  | 'setup_import'
  | 'places'
  | 'not_found';

export interface RouteMatch {
  name: RouteName;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
}

const TABLE: { name: RouteName; re: RegExp; keys: string[] }[] = [
  { name: 'home', re: /^\/$/, keys: [] },
  { name: 'search', re: /^\/search\/?$/, keys: [] },
  { name: 'routes', re: /^\/routes\/?$/, keys: [] },
  { name: 'trip', re: /^\/trip\/?$/, keys: [] },
  { name: 'journey', re: /^\/journey\/?$/, keys: [] },
  { name: 'guide', re: /^\/guide\/?$/, keys: [] },
  { name: 'share_start', re: /^\/share\/start\/?$/, keys: [] },
  { name: 'viewer', re: /^\/t\/([A-Za-z0-9]{6,32})\/?$/, keys: ['id'] },
  { name: 'help', re: /^\/help\/?$/, keys: [] },
  { name: 'settings', re: /^\/settings\/?$/, keys: [] },
  { name: 'about', re: /^\/about\/?$/, keys: [] },
  { name: 'welcome', re: /^\/welcome\/?$/, keys: [] },
  { name: 'family', re: /^\/family\/?$/, keys: [] },
  { name: 'family_edit', re: /^\/family\/edit\/?$/, keys: [] },
  { name: 'setup_start', re: /^\/setup\/start\/?$/, keys: [] },
  { name: 'setup', re: /^\/setup\/?$/, keys: [] },
  { name: 'places', re: /^\/places\/?$/, keys: [] },
  { name: 'setup_import', re: /^\/s\/([A-Za-z0-9]{6,32})\/?$/, keys: ['code'] },
];

export function matchRoute(url: string): RouteMatch {
  const u = new URL(url, 'http://x');
  for (const r of TABLE) {
    const m = r.re.exec(u.pathname);
    if (m) {
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1] ?? '')));
      return { name: r.name, path: u.pathname, params, query: u.searchParams };
    }
  }
  return { name: 'not_found', path: u.pathname, params: {}, query: u.searchParams };
}

/** Public standalone pages: Back from them leaves the app (no seeded Home entry). */
export const STANDALONE: ReadonlySet<RouteName> = new Set(['viewer', 'setup']);

/** Screens that are the root of the in-app stack (no Home seeded underneath). F1 first run is a root. */
export const ROOTS: ReadonlySet<RouteName> = new Set(['home', 'welcome']);
