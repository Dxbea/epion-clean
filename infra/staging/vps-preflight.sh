#!/usr/bin/env bash
set -euo pipefail

MIN_RAM_MB=4096
MIN_DISK_GB=25
failed=0

section() { printf '\n== %s ==\n' "$1"; }
warn() { printf 'WARN: %s\n' "$1" >&2; }
fail() { printf 'FAIL: %s\n' "$1" >&2; failed=1; }

section "OS"
if [[ -r /etc/os-release ]]; then cat /etc/os-release; else warn "/etc/os-release unavailable"; fi
uname -a

section "Resources"
ram_mb=$(awk '/MemTotal/ { print int($2 / 1024) }' /proc/meminfo)
disk_gb=$(df -PB1 / | awk 'NR==2 { print int($4 / 1024 / 1024 / 1024) }')
printf 'RAM available to host: %s MiB\n' "$ram_mb"
printf 'Free disk on /: %s GiB\n' "$disk_gb"
(( ram_mb >= MIN_RAM_MB )) || fail "At least ${MIN_RAM_MB} MiB RAM is required; 8 GiB is preferred when production shares this VPS."
(( disk_gb >= MIN_DISK_GB )) || fail "At least ${MIN_DISK_GB} GiB free disk is required."

section "Docker"
command -v docker >/dev/null 2>&1 || fail "docker is not installed or not in PATH"
if command -v docker >/dev/null 2>&1; then docker --version; fi
if ! docker compose version; then fail "Docker Compose v2 is required"; fi

section "Listening ports"
ss -ltnp '( sport = :80 or sport = :443 or sport = :5432 or sport = :6379 or sport = :5175 )' || true
if ss -ltn '( sport = :80 or sport = :443 )' | grep -q LISTEN; then
  warn "Ports 80/443 are already in use. Do not start the standalone Caddy profile; integrate the staging host into the existing edge proxy after approval."
fi

section "Firewall"
if command -v ufw >/dev/null 2>&1; then ufw status verbose || true; else warn "ufw is not installed"; fi
if command -v nft >/dev/null 2>&1; then nft list ruleset || true; fi

section "Required exposure"
printf '%s\n' "Only TCP 80/443 should be public. PostgreSQL, Redis and port 5175 must remain unbound to the host."

if (( failed )); then
  printf '\nNO-GO: resolve failed prerequisites before deployment.\n' >&2
  exit 1
fi

printf '\nGO: host prerequisites meet the minimum staging baseline.\n'
