#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: ./scripts/invoke-labresults.sh <function> [args...]"
  exit 1
fi

function_name="$1"
shift

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required. Install it first."
  exit 1
fi

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
load_env "env/machine1.env"
require_fabric_binaries
set_peer_cli_env
set_peer_context peer0

peer0_tls="${ROOT_DIR}/organizations/peerOrganizations/${LAB_ORG_DOMAIN}/peers/${PEER0_HOST}/tls/ca.crt"
orderer_ca="$(orderer_ca_file)"
payload="$(jq -cn --arg fn "${function_name}" --args "$@" '{function: $fn, Args: $ARGS.positional}')"

peer chaincode invoke \
  -o "${ORDERER_HOST}:${ORDERER_PORT}" \
  --ordererTLSHostnameOverride "${ORDERER_HOST}" \
  --tls \
  --cafile "${orderer_ca}" \
  -C "${CHANNEL_NAME}" \
  -n "${CC_NAME}" \
  --peerAddresses "${PEER0_HOST}:${PEER_PORT}" \
  --tlsRootCertFiles "${peer0_tls}" \
  -c "${payload}" \
  --waitForEvent

