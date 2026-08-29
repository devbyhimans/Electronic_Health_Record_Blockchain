#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
load_env "env/machine3.env"
ensure_linux_docker
wait_for_docker
require_fabric_binaries

mkdir -p "${ROOT_DIR}/data/peer2"
compose_up "docker/docker-compose.machine3.yaml"

docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
