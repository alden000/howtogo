/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** Worker base URL; "" or unset = same origin (/api/* routed to the Worker). */
  readonly VITE_API_BASE?: string;
  /** "1" = use the fixture-backed mock API (no credentials needed). */
  readonly VITE_API_MOCK?: string;
  /** Comma-separated feature flags baked into a build (e.g. "guide" for M2). */
  readonly VITE_FLAGS?: string;
}
