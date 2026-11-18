// Worker entry for Workers Static Assets (wrangler.toml, the default for both Workers): the PWA comes from
// the ASSETS binding, so the bundle does NOT include the embedded build (M5; see src/index.embed.ts).
import { NO_EMBED, createWorker } from "./app";

export { health } from "./app";
export { TripShare } from "./share";
export { SetupBox } from "./setup";
export { Stats } from "./stats";

export default createWorker(NO_EMBED);
