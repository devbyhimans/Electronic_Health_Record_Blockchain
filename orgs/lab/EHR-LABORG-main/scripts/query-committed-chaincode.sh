#!/usr/bin/env bash
set -euo pipefail

cc_name="${1:-labresults}"

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
load_env
require_fabric_binaries
set_peer_cli_env
set_peer_context peer0

peer lifecycle chaincode querycommitted --channelID "${CHANNEL_NAME}" --name "${cc_name}"

