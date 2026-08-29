#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: ./scripts/verify-channel.sh peer0|peer1|peer2"
  exit 1
fi

peer_name="$1"

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
load_env
require_fabric_binaries
set_peer_cli_env
set_peer_context "${peer_name}"

echo "Checking ${peer_name} on channel ${CHANNEL_NAME} ..."
peer channel getinfo -c "${CHANNEL_NAME}"

