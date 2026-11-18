#!/usr/bin/env bash
# Runs the Developer's e2e suite (src/web/e2e, config qa/playwright.dev.docker.config.mjs) inside the
# official Playwright Linux image whose version equals the repo's @playwright/test, with the repo mounted.
# Why: the dev suite's screenshot baselines are Linux-recorded; on a Windows host the pixel compare is
# only like-for-like inside Linux (Director ruling 2026-11-18). qa/gate.sh uses this on Windows when
# Docker is available.
#
#   qa/scripts/dev-e2e-docker.sh [playwright args…]      e.g. e2e/fixa.spec.ts, --grep T9
#   qa/scripts/dev-e2e-docker.sh --update-snapshots      re-record baselines (Developer only, never the gate)
# Needs a built qa/.out/dist (the gate's build step, or: cd src/web && npx vite build --outDir ../../qa/.out/dist).
# Env: QA_DEV_WORKERS (default 2: a 4-core host also runs Docker Desktop), QA_DEV_PORT (default 4183).
set -euo pipefail
wpwd() { pwd -W 2>/dev/null || pwd; }
ROOT="$(cd "$(dirname "$0")/../.." && wpwd)"
VER=$(cd "$ROOT" && node -p "require('@playwright/test/package.json').version")
IMAGE="mcr.microsoft.com/playwright:v${VER}-noble"
[ -f "$ROOT/qa/.out/dist/index.html" ] || { echo "dev-e2e-docker: no build in qa/.out/dist" >&2; exit 2; }
docker info >/dev/null 2>&1 || { echo "dev-e2e-docker: Docker is not running" >&2; exit 2; }
docker image inspect "$IMAGE" >/dev/null 2>&1 || docker pull -q "$IMAGE" >/dev/null
echo "dev-e2e-docker: $IMAGE"
# MSYS_NO_PATHCONV: keep /repo as a container path (Git Bash would rewrite it to C:/Program Files/Git/repo).
MSYS_NO_PATHCONV=1 exec docker run --rm --ipc=host --init \
  -v "$ROOT:/repo" -w /repo/src/web \
  -e CI=1 -e QA_DEV_WORKERS="${QA_DEV_WORKERS:-2}" -e QA_DEV_PORT="${QA_DEV_PORT:-4183}" \
  "$IMAGE" node /repo/node_modules/@playwright/test/cli.js test -c /repo/qa/playwright.dev.docker.config.mjs "$@"
