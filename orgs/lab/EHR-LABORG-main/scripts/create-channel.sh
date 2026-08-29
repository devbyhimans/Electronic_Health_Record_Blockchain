#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
load_env "env/machine1.env"
require_fabric_binaries
set_peer_cli_env
set_peer_context peer0

channel_tx="${ROOT_DIR}/channel-artifacts/${CHANNEL_NAME}.tx"
channel_block="${ROOT_DIR}/channel-artifacts/${CHANNEL_NAME}.block"
orderer_ca="$(orderer_ca_file)"

if [[ ! -f "${channel_tx}" ]]; then
  echo "Missing channel tx file at ${channel_tx}. Run ./scripts/generate-artifacts.sh first."
  exit 1
fi

peer channel create \
  -o "${ORDERER_HOST}:${ORDERER_PORT}" \
  -c "${CHANNEL_NAME}" \
  -f "${channel_tx}" \
  --outputBlock "${channel_block}" \
  --tls \
  --cafile "${orderer_ca}"

peer channel join -b "${channel_block}"

echo "Channel ${CHANNEL_NAME} created and peer0 joined."
