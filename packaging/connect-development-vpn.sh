#!/bin/bash
# Connect a macOS backend development host without replacing general DNS.
set -euo pipefail
[[ "$(uname -s)" == Darwin && "$(id -u)" == 0 ]] || { printf '%s\n' 'Run on the macOS development host with sudo.' >&2; exit 1; }
[[ $# -ge 1 && $# -le 2 && "$1" == /* && -f "$1" ]] || { printf '%s\n' 'Supply the absolute private WireGuard profile path and provider hostname.' >&2; exit 1; }
profile="$1"
hostname="${2:-$(sed -n 's/^# ProviderHostname = //p' "$profile")}"
[[ "$hostname" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || { printf '%s\n' 'Supply the provider hostname argument or its ProviderHostname profile comment.' >&2; exit 1; }
if grep -Eq '^[[:space:]]*DNS[[:space:]]*=' "$profile"; then
  printf '%s\n' 'Disconnect the old profile before removing its DNS setting. Use a profile without a DNS line for this split-DNS connection.' >&2
  exit 1
fi
wg_quick="$(command -v wg-quick || true)"
if [[ -z "$wg_quick" && -x /opt/homebrew/bin/wg-quick ]]; then wg_quick=/opt/homebrew/bin/wg-quick; fi
if [[ -z "$wg_quick" && -x /usr/local/bin/wg-quick ]]; then wg_quick=/usr/local/bin/wg-quick; fi
[[ -n "$wg_quick" ]] || { printf '%s\n' 'Install the official WireGuard tools before connecting.' >&2; exit 1; }
# Remove a global resolver that exactly matches this VPN DNS address.
while IFS= read -r service; do
  [[ -n "$service" && "$service" != \** ]] || continue
  servers="$(networksetup -getdnsservers "$service" 2>/dev/null || true)"
  if [[ "$servers" == 10.66.0.1 ]]; then
    networksetup -setdnsservers "$service" empty
  fi
done < <(networksetup -listallnetworkservices | tail -n +2)

install -d -m 755 /etc/resolver
resolver="/etc/resolver/$hostname"
expected="$(mktemp)"
trap 'rm -f "$expected"' EXIT
printf 'nameserver 10.66.0.1\ntimeout 1\n' > "$expected"
if [[ -e "$resolver" ]] && ! cmp -s "$expected" "$resolver"; then
  printf '%s\n' 'Existing provider resolver retained. Review it before changing local DNS.' >&2
  exit 1
fi
install -m 644 "$expected" "$resolver"
"$wg_quick" up "$profile"
dscacheutil -flushcache
printf '%s\n' 'Backend VPN connected. Only the provider hostname uses private VPN DNS; general DNS remains independent.'
