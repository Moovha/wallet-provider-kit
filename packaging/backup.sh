#!/usr/bin/env bash
# Explicit host operation. Backups contain custody material and require encryption.
set -euo pipefail
umask 077
provider_dir="${WPK_DIRECTORY:-${HOME}/.wallet-provider}"
[[ $# == 1 && "$1" == /* ]] || { printf '%s\n' 'Use backup.sh /absolute/path/outside-installation/backup.tgz.enc' >&2; exit 1; }
provider_dir="$(cd "$provider_dir" && pwd)"
backup_parent="$(cd "$(dirname "$1")" && pwd)"
backup_file="$backup_parent/$(basename "$1")"
[[ "$backup_file" != "$provider_dir/"* && ! -e "$backup_file" ]] || { printf '%s\n' 'Choose a new backup path outside the installation.' >&2; exit 1; }
command -v openssl >/dev/null
command -v docker >/dev/null
# Stop all writers and retain uncertain attempts. Never delete containers or volumes.
docker compose --env-file /dev/null --file "$provider_dir/compose.json" --profile https stop
printf '%s\n' 'Writers are stopped. Enter an encryption passphrase; keep it separately from the backup.'
set -o noclobber
tar -czf - -C "$provider_dir" . | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 600000 > "$backup_file"
printf '%s\n' 'Encrypted backup written. Leave the service stopped until you review in-flight and uncertain work. Restart using the retained Compose file.'
