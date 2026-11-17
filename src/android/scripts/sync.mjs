// M6 spike: `cap sync android`, then copy the spike harness next to the web build in the APK assets.
// Usage: node scripts/sync.mjs   (CAP_SPIKE=1 makes the APK start on /spike.html)
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
if (!existsSync(join(root, '../web/dist/index.html'))) {
  console.error('src/web/dist missing: run `npm run build -w @howtogo/web` at the repo root first.');
  process.exit(1);
}
execSync('npx cap sync android', { cwd: root, stdio: 'inherit' });
copyFileSync(join(root, 'spike/spike.html'), join(root, 'android/app/src/main/assets/public/spike.html'));
console.log('spike.html copied');
