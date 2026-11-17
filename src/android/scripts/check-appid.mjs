// M6 AC 2: the appId must be identical in capacitor.config.ts and android/app/build.gradle.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = readFileSync(join(root, 'capacitor.config.ts'), 'utf8').match(/appId:\s*'([^']+)'/)?.[1];
const gradle = readFileSync(join(root, 'android/app/build.gradle'), 'utf8');
const appId = gradle.match(/applicationId\s+"([^"]+)"/)?.[1];
const ns = gradle.match(/namespace\s*=\s*"([^"]+)"/)?.[1];
if (!cfg || cfg !== appId || cfg !== ns) {
  console.error(`appId mismatch: capacitor.config.ts=${cfg} build.gradle applicationId=${appId} namespace=${ns}`);
  process.exit(1);
}
console.log(`appId ok: ${cfg}`);
