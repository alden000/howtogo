#!/usr/bin/env bash
# free-ports.sh <port>...: kill (whole process tree) whatever still LISTENs on the given QA-owned ports.
# Used by gate.sh after every step and by lighthouse.sh on exit, so no vite preview / wrangler / workerd
# survives a step (Windows: Playwright's and bash's kill can leave npx → node children orphaned).
# Matches IPv4 and IPv6 ([::1]) listeners: vite preview binds localhost → ::1 on Windows.
# Only pass ports this suite owns (4183 dev-e2e, 4184 qa-e2e, 4186 lighthouse, 18797 qa worker).
for port in "$@"; do
  if command -v netstat.exe >/dev/null 2>&1; then
    for pid in $(netstat.exe -ano 2>/dev/null | awk -v p=":$port" '$1 == "TCP" && $2 ~ p"$" && $4 == "LISTENING" {print $5}' | sort -u); do
      [ "$pid" -gt 0 ] 2>/dev/null && taskkill.exe //F //T //PID "$pid" >/dev/null 2>&1 && echo "free-ports: killed pid $pid on :$port"
    done
  elif command -v fuser >/dev/null 2>&1; then
    fuser -k "$port/tcp" >/dev/null 2>&1 && echo "free-ports: killed listener on :$port"
  fi
done
exit 0
