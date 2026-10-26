#!/usr/bin/env bash
# Host-only operation; the source remains stopped after backup.
set -euo pipefail
umask 077
script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$script_directory/recovery.py" backup "$@"
