#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
load_env
require_fabric_binaries
set_peer_cli_env

failed=0

for peer_name in peer0 peer1 peer2; do
  echo
  echo "=== ${peer_name} ==="
  if ! "${ROOT_DIR}/scripts/verify-channel.sh" "${peer_name}"; then
    failed=1
  fi
done

exit "${failed}"

