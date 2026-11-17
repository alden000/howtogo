// The dev e2e suite inside the official Playwright Linux image (qa/scripts/dev-e2e-docker.sh): the
// screenshot baselines were recorded on Linux, so Windows hosts compare like-for-like this way.
// Same settings as playwright.dev.config.mjs; only the web server differs (no Vite: the mounted
// node_modules are Windows builds), and workers can be capped with QA_DEV_WORKERS.
import base from './playwright.dev.config.mjs';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/');
const PORT = Number(process.env.QA_DEV_PORT ?? 4183);
export default {
  ...base,
  workers: Number(process.env.QA_DEV_WORKERS ?? base.workers),
  webServer: { ...base.webServer, command: `node ${here}scripts/serve-dist.mjs ${here}.out/dist ${PORT}`, cwd: here + '..' },
};
