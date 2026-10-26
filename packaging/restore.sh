#!/usr/bin/env bash
# Restore to a new directory with execution and container startup disabled.
set -euo pipefail
umask 077
script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$script_directory/recovery.py" restore "$@"
