#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: ./scripts/join-channel.sh peer0|peer1|peer2"
  exit 1
fi

peer_name="$1"

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
load_env
require_fabric_binaries
set_peer_cli_env
set_peer_context "${peer_name}"

channel_block="${ROOT_DIR}/channel-artifacts/${CHANNEL_NAME}.block"

if [[ ! -f "${channel_block}" ]]; then
  echo "Missing ${channel_block}. Create the channel on machine 1 and copy the updated repo or this block file first."
  exit 1
fi

peer channel join -b "${channel_block}"

echo "${peer_name} joined ${CHANNEL_NAME}."
