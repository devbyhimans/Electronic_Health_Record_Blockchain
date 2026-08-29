#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: ./scripts/query-labresults.sh peer0|peer1|peer2 <function> [args...]"
  exit 1
fi

peer_name="$1"
shift
function_name="$1"
shift

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required. Install it first."
  exit 1
fi

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
load_env
require_fabric_binaries
set_peer_cli_env
set_peer_context "${peer_name}"

payload="$(jq -cn --arg fn "${function_name}" --args "$@" '{function: $fn, Args: $ARGS.positional}')"

peer chaincode query \
  -C "${CHANNEL_NAME}" \
  -n "${CC_NAME}" \
  -c "${payload}"

