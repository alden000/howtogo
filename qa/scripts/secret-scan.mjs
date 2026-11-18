// Secret scan: src/ (tracked + untracked, excl. node_modules/.wrangler) and the built dist/.
// Fails on: JWTs, private keys, AWS/Google-style keys, credential assignments with real-looking values,
// e-mail addresses outside an allow-list, and real values in wrangler.toml [vars]/ids.
import { fileURLToPath } from 'node:url';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
const root = fileURLToPath(new URL('../..', import.meta.url));
const dist = process.argv[2] ?? join(root, 'qa/.out/dist');
const SKIP = new Set(['node_modules', '.wrangler', 'dist', 'test-results', 'playwright-report', 'baselines']);
const BIN = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|zip|gz)$/i;
const EMAIL_OK = /@(example\.(com|org)|howtogo\.local|anthropic\.com)$/i;
const PLACEHOLDER = /^(change-?me|replace[-_ a-z]*|your[-_a-z]*|x+|\*+|test|dummy|fake|placeholder|<.*>|\$\{.*\}|REPLACE.*)$/i;
const rules = [
  ['jwt', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ['aws-key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['google-key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['bearer-literal', /Bearer\s+[A-Za-z0-9._-]{24,}/g],
];
const ASSIGN = /\b(ONEMAP_EMAIL|ONEMAP_PASSWORD|LTA_ACCOUNT_KEY|password|passwd|api[_-]?key|account[_-]?key|secret|access[_-]?token)\b["']?\s*[:=]\s*["']([^"'\s]{6,})["']/gi;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Reviewed test-only dummy values (Worker vitest bindings). Adding to this list needs QA review.
const KNOWN_TEST_VALUES = new Set(['s3cret-pass', 'lta-test-key']);
const findings = [];
function walk(dir, inDist) {
  for (const n of readdirSync(dir)) {
    if (!inDist && SKIP.has(n)) continue;
    const p = join(dir, n);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, inDist);
    else if (!BIN.test(n) && s.size < 5e6) scan(p, readFileSync(p, 'utf8'), inDist);
  }
}
function scan(p, txt, inDist) {
  const rel = relative(root, p).split(sep).join('/'); // posix-style on Windows too
  for (const [id, re] of rules) for (const m of txt.matchAll(re)) findings.push(`${id}: ${rel} "${m[0].slice(0, 16)}…"`);
  for (const m of txt.matchAll(ASSIGN)) if (!PLACEHOLDER.test(m[2]) && !(KNOWN_TEST_VALUES.has(m[2]) && !inDist) && !/example\.com$/.test(m[2])) {
    // Test files may assign obviously fake values; only flag them in dist or non-test files.
    if (!inDist && /(\/test\/|\.test\.|\.spec\.|fixtures?)/.test(rel) && /^(t|tok|token|pw|pass)[-_0-9a-z]*$/i.test(m[2])) continue;
    findings.push(`credential-assign: ${rel} ${m[1]}=${m[2].slice(0, 3)}…(${m[2].length} chars)`);
  }
  for (const m of txt.matchAll(EMAIL)) {
    const e = m[0];
    if (EMAIL_OK.test(e) || /\.(png|svg|js|css|ts)$/i.test(e) || /^[^@]+@\d/.test(e)) continue; // e.g. pkg@1.2.3, icon@2x
    findings.push(`email: ${rel} ${e.replace(/^(.).*@/, '$1***@')}`);
  }
}
walk(join(root, 'src'), false);
if (existsSync(dist)) walk(dist, true); else findings.push(`dist missing: ${dist}`);
// wrangler.toml: [vars] must not hold credentials, ids must be placeholders.
const wt = readFileSync(join(root, 'src/worker/wrangler.toml'), 'utf8');
if (/^\s*(ONEMAP_EMAIL|ONEMAP_PASSWORD|LTA_ACCOUNT_KEY)\s*=/m.test(wt)) findings.push('wrangler.toml: credential in [vars]');
// KV namespace ids are not secrets (Director ruling, M2 gate): the reviewed TOKEN_KV id is allow-listed.
// Any other real-looking id still needs QA review before it is added here.
// 1e51…: TOKEN_KV recreated on the owner's account (3e27b40), reviewed by QA at the M3/M4 gate.
// + preview KV id: Director 2026-11-18, KV ids are not secrets; QA to confirm.
const KV_ID_OK = new Set(['0dc8a4714f234b5bb8d23ffe36cb2107', '1e514bcf1539494db863191de13f5d3c', '9117797d93c84067b99373afdbaa4bca']);
for (const m of wt.matchAll(/^\s*id\s*=\s*"([^"]*)"/gm)) if (/^[0-9a-f]{32}$/.test(m[1]) && !KV_ID_OK.has(m[1])) findings.push('wrangler.toml: real-looking KV id (not a secret, but confirm intended)');
// Files that must never be tracked.
import { execSync } from 'node:child_process';
const tracked = execSync('git ls-files', { cwd: root }).toString().split('\n');
for (const f of tracked) if (/(^|\/)(\.dev\.vars|\.env)(\.local)?$/.test(f)) findings.push(`tracked secret file: ${f}`);
if (findings.length) { console.log(`secret-scan FAIL (${findings.length})`); for (const f of findings) console.log('  ' + f); process.exit(1); }
console.log('secret-scan ok (src/ + dist/ + wrangler.toml + tracked files)');
