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
  // Developer C 2026-11-18: the container renders with software GL (SwiftShader, the map canvas included) inside
  // the Docker Desktop VM. Measured: the demo GPS stream (demoMs=30) advances ~4 fixes/s there instead of ~30,
  // because each fix re-renders the map on the CPU. So the long simulated-trip tests (demo.spec:14,
  // guide.spec:153, guide.spec:456) ran out of time there while passing on the host. Not a product bug (real
  // fixes arrive every 1-5 s). Double the per-test budget and the default expect timeout in the container only.
  timeout: 2 * (base.timeout ?? 30_000),
  expect: { ...base.expect, timeout: 15_000 },
  workers: Number(process.env.QA_DEV_WORKERS ?? base.workers),
  webServer: { ...base.webServer, command: `node ${here}scripts/serve-dist.mjs ${here}.out/dist ${PORT}`, cwd: here + '..' },
};
