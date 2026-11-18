// The app version the Worker reports on /api/health and files its own stats rows under: the web
// package's version, so one deploy = one version string (M5 AC 31/33).
import web from "../../web/package.json";

export const APP_VERSION: string = web.version;
