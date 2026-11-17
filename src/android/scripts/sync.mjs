// `cap sync android` + checks. The spike harness is copied only for CAP_SPIKE=1 (never in release, M6 AC 1).
// Usage: node scripts/sync.mjs
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
if (!existsSync(join(root, '../web/dist/index.html'))) {
  console.error('src/web/dist missing: run `npm run build:release` at the repo root first.');
  process.exit(1);
}
execSync('node scripts/check-appid.mjs', { cwd: root, stdio: 'inherit' });
execSync('npx cap sync android', { cwd: root, stdio: 'inherit' });
const pub = join(root, 'android/app/src/main/assets/public');
// The service worker is never registered in the app (AC 4); drop it from the APK too.
for (const f of ['sw.js', 'spike.html']) rmSync(join(pub, f), { force: true });
if (process.env.CAP_SPIKE === '1') {
  copyFileSync(join(root, 'spike/spike.html'), join(pub, 'spike.html'));
  console.log('spike.html copied (CAP_SPIKE=1)');
}
