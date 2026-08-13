#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
load_env "env/machine1.env"
ensure_colima
wait_for_docker
require_fabric_binaries

mkdir -p "${ROOT_DIR}/data/orderer" "${ROOT_DIR}/data/peer0" "${ROOT_DIR}/data/ipfs"
compose_up "docker/docker-compose.machine1.yaml"

docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

echo
echo "Hyperledger Explorer: http://localhost:${EXPLORER_PORT:-8081}"

