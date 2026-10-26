#!/usr/bin/env bash
# Verification never starts containers or signs an operation.
set -euo pipefail
umask 077
script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$script_directory/recovery.py" verify "$@"
