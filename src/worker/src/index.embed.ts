// Opt-in Worker entry with the web build EMBEDDED (wrangler.embed.toml, `npm run deploy:* -- --embed`): only
// for networks where wrangler's assets upload fails. Needs `npm run embed -w @howtogo/worker` first
// (src/generated/assets.ts, gitignored). Unit tests use this entry (vitest → wrangler.embed.toml).
import { createWorker } from "./app";
import { ASSET_MAP, HEADER_RULES } from "./generated/assets";

export { health } from "./app";
export { TripShare } from "./share";
export { SetupBox } from "./setup";
export { Stats } from "./stats";

export default createWorker({ assets: ASSET_MAP, rules: HEADER_RULES });
