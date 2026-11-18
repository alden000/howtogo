/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** Worker base URL; "" or unset = same origin (/api/* routed to the Worker). */
  readonly VITE_API_BASE?: string;
  /** M6: API origin used inside the Android app (default: the production Worker). */
  readonly VITE_NATIVE_API_BASE?: string;
  /** "1" = use the fixture-backed mock API (no credentials needed). */
  readonly VITE_API_MOCK?: string;
  /** Comma-separated feature flags baked into a build (e.g. "guide" for M2). */
  readonly VITE_FLAGS?: string;
}

/** QA-56: the hashed MapLibre chunk URL (build) or null (dev); see vite.config.ts maplibreUrl(). */
declare module 'virtual:maplibre-url' {
  const url: string | null;
  export default url;
}
