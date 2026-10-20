#!/usr/bin/env bash
# Run a reviewed release bundle; installation never enables wallet operations.
set -euo pipefail
umask 077
bundle_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
provider_dir="${WPK_DIRECTORY:-${HOME}/.wallet-provider}"
provider_origin="${WPK_ORIGIN:-https://localhost}"
provider_name="${WPK_NAME:-Wallet provider}"
provider_privacy="${WPK_PRIVACY_URL:-https://localhost/privacy}"
provider_local="${WPK_LOCAL:-true}"
if [[ "$(id -u)" == 0 ]]; then
  printf '%s\n' 'Run as the dedicated service account with access to a local Docker runtime.' >&2
  exit 1
fi
command -v docker >/dev/null || { printf '%s\n' 'Install and start Docker with Compose, then run this installer again.' >&2; exit 1; }
docker compose version >/dev/null
[[ "$(docker info --format '{{.OSType}}')" == linux ]] || { printf '%s\n' 'A Linux container runtime is required.' >&2; exit 1; }
provider_endpoint="$(docker context inspect --format '{{.Endpoints.docker.Host}}')"
[[ -z "${DOCKER_HOST:-}" && "$provider_endpoint" == unix:///* ]] || { printf '%s\n' 'Select a local Unix-socket Docker context and unset DOCKER_HOST.' >&2; exit 1; }
if command -v sha256sum >/dev/null; then (cd "$bundle_dir" && sha256sum --check SHA256SUMS); else (cd "$bundle_dir" && shasum -a 256 --check SHA256SUMS); fi
api_image="$(sed -n 's/^API_IMAGE=//p' "$bundle_dir/release.env")"
bundler_image="$(sed -n 's/^BUNDLER_IMAGE=//p' "$bundle_dir/release.env")"
[[ "$api_image" =~ ^ghcr.io/moovha/wallet-provider-kit@sha256:[a-f0-9]{64}$ ]] || exit 1
[[ "$bundler_image" =~ ^ghcr.io/moovha/wallet-provider-kit-bundler@sha256:[a-f0-9]{64}$ ]] || exit 1
[[ "$provider_origin" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]] || { printf '%s\n' 'Use an HTTPS origin without credentials, paths or query parameters.' >&2; exit 1; }
case "$provider_local" in true|false) ;; *) printf '%s\n' 'WPK_LOCAL must be true or false.' >&2; exit 1 ;; esac
if [[ "$provider_local" == false && ( "$provider_origin" == https://localhost || "$provider_privacy" == https://localhost/privacy ) ]]; then printf '%s\n' 'Remote installation requires WPK_ORIGIN and WPK_PRIVACY_URL for the final HTTPS service.' >&2; exit 1; fi
provider_parent="$(dirname "$provider_dir")"
[[ -d "$provider_parent" ]] || { printf '%s\n' 'Create a private parent directory for the installation first.' >&2; exit 1; }
provider_space="$(df -Pk "$provider_parent" | awk 'END {print $4}')"
[[ "$provider_space" =~ ^[0-9]+$ && "$provider_space" -ge 5242880 ]] || { printf '%s\n' 'Keep at least 5 GiB free for image download, installation and retained state.' >&2; exit 1; }
read -r provider_cpus provider_memory <<< "$(docker info --format '{{.NCPU}} {{.MemTotal}}')"
[[ "$provider_cpus" -ge 2 && "$provider_memory" -ge 2147483648 ]] || { printf '%s\n' 'Use a container runtime with at least two CPUs and 2 GiB memory. Production sizing requires separate evidence.' >&2; exit 1; }
mkdir -p "$provider_dir"
provider_dir="$(cd "$provider_dir" && pwd)"
printf 'Destination: %s\nProvider origin: %s\nAPI image: %s\n' "$provider_dir" "$provider_origin" "$api_image"
printf '%s\n' 'The service retains private data and secrets here. Wallet operations start disabled.'
if [[ "${WPK_ACCEPT_PLAN:-false}" != true ]]; then
  read -r -p 'Deploy this provider? [y/N] ' provider_answer
  [[ "$provider_answer" == y || "$provider_answer" == Y ]] || exit 0
fi
docker --host "$provider_endpoint" pull "$api_image"
docker --host "$provider_endpoint" run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp \
  --user "$(id -u):$(id -g)" --mount "type=bind,source=$provider_dir,target=/config" \
  --env "WPK_HOST_DIRECTORY=$provider_dir" --env "WPK_API_IMAGE=$api_image" --env "WPK_BUNDLER_IMAGE=$bundler_image" \
  --env "WPK_NAME=$provider_name" --env "WPK_ORIGIN=$provider_origin" --env "WPK_PRIVACY_URL=$provider_privacy" \
  --env "WPK_LOCAL=$provider_local" --env "WPK_NETWORK=${WPK_NETWORK:-base}" \
  "$api_image" node dist/main.js install-init
compose=(docker --host "$provider_endpoint" compose --env-file /dev/null --file "$provider_dir/compose.json")
"${compose[@]}" pull
if [[ "$provider_local" == false ]]; then
  "${compose[@]}" --profile https up --detach --wait
  printf 'Administration: %s/admin/\n' "$provider_origin"
else
  "${compose[@]}" up --detach --wait
  printf '%s\n' 'Administration: http://127.0.0.1:8080/admin/'
fi
"${compose[@]}" exec -T api node -e "fetch('http://127.0.0.1:8080/health/management').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
printf 'Read the private claim credential from %s/installation-claim to create the administrator.\n' "$provider_dir"
printf '%s\n' 'Claim access within 30 minutes of first startup. Rerunning installation preserves identity and secrets.'
