#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
load_env
require_fabric_binaries
set_configtx_env

rm -rf "${ROOT_DIR}/organizations" "${ROOT_DIR}/system-genesis-block" "${ROOT_DIR}/channel-artifacts"
mkdir -p "${ROOT_DIR}/organizations" "${ROOT_DIR}/system-genesis-block" "${ROOT_DIR}/channel-artifacts" "${ROOT_DIR}/data/peer0" "${ROOT_DIR}/data/peer1" "${ROOT_DIR}/data/peer2" "${ROOT_DIR}/data/orderer" "${ROOT_DIR}/connection-profiles"

cryptogen generate --config="${ROOT_DIR}/config/crypto-config.yaml" --output="${ROOT_DIR}/organizations"

configtxgen -profile LabOrdererGenesis -channelID "${SYS_CHANNEL}" -outputBlock "${ROOT_DIR}/system-genesis-block/genesis.block"
configtxgen -profile LabChannel -channelID "${CHANNEL_NAME}" -outputCreateChannelTx "${ROOT_DIR}/channel-artifacts/${CHANNEL_NAME}.tx"

"${ROOT_DIR}/scripts/generate-connection-profile.sh"

echo
echo "Generated:"
echo "- ${ROOT_DIR}/organizations"
echo "- ${ROOT_DIR}/system-genesis-block/genesis.block"
echo "- ${ROOT_DIR}/channel-artifacts/${CHANNEL_NAME}.tx"
